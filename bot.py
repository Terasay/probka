from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import os
import sqlite3
import shutil
import logging
from datetime import datetime, timezone
from fastapi import FastAPI, Request, Depends, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from passlib.hash import bcrypt
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)



from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List

app = FastAPI()

# --- JWT настройки ---
JWT_SECRET = os.environ.get("JWT_SECRET", "supersecretkey")
JWT_ALGORITHM = "HS256"
security = HTTPBearer()

def create_jwt_token(user: dict):
    payload = {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"]
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="Недействительный токен")

def require_admin(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Требуется роль администратора")
    return user

def require_user(user=Depends(get_current_user)):
    return user

# --- Хранилище подключений WebSocket по chat_id ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, chat_id: int, websocket: WebSocket):
        await websocket.accept()
        if chat_id not in self.active_connections:
            self.active_connections[chat_id] = []
        self.active_connections[chat_id].append(websocket)

    def disconnect(self, chat_id: int, websocket: WebSocket):
        if chat_id in self.active_connections:
            self.active_connections[chat_id].remove(websocket)
            if not self.active_connections[chat_id]:
                del self.active_connections[chat_id]

    async def broadcast(self, chat_id: int, message: dict):
        if chat_id in self.active_connections:
            for connection in self.active_connections[chat_id]:
                await connection.send_json(message)

manager = ConnectionManager()

# --- Глобальное хранилище подключений WebSocket ---
class GlobalConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logging.error(f"Error sending message: {e}")

# Инициализация глобального менеджера
global_manager = GlobalConnectionManager()

# --- Восстановить endpoint для списка чатов ---
@app.get("/api/messenger/chats")
async def get_user_chats(user_id: int, is_admin: bool = False):
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        if is_admin:
            cur.execute("SELECT id, type, title FROM chats")
            chats = cur.fetchall()
        else:
            cur.execute("""
                SELECT c.id, c.type, c.title
                FROM chats c
                JOIN chat_members m ON c.id = m.chat_id
                WHERE m.user_id = ?
            """, (user_id,))
            chats = cur.fetchall()
        result = []
        for c in chats:
            chat_id = c[0]
            # Подсчёт непрочитанных сообщений
            cur.execute("SELECT last_read_msg_id FROM chat_reads WHERE user_id = ? AND chat_id = ?", (user_id, chat_id))
            row = cur.fetchone()
            last_read = row[0] if row else 0
            cur.execute("SELECT COUNT(*) FROM chat_messages WHERE chat_id = ? AND id > ?", (chat_id, last_read))
            unread_count = cur.fetchone()[0]
            # Последнее сообщение
            cur.execute("SELECT id, sender_id, sender_name, content FROM chat_messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1", (chat_id,))
            last_msg_row = cur.fetchone()
            lastMsg = None
            if last_msg_row:
                lastMsg = {
                    "id": last_msg_row[0],
                    "sender_id": last_msg_row[1],
                    "sender_name": last_msg_row[2],
                    "content": last_msg_row[3]
                }
            result.append({"id": chat_id, "type": c[1], "title": c[2], "unread_count": unread_count, "lastMsg": lastMsg})
        return result

# --- WebSocket endpoint для чата ---
@app.websocket("/ws/chat/{chat_id}")
async def chat_websocket(websocket: WebSocket, chat_id: int):
    await manager.connect(chat_id, websocket)
    try:
        while True:
            # Клиент может отправлять ping или ничего не отправлять
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(chat_id, websocket)

# --- WebSocket endpoint для глобального мессенджера ---
@app.websocket("/ws/messenger")
async def messenger_websocket(websocket: WebSocket):
    await global_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # Ожидание сообщений от клиента (можно игнорировать)
    except WebSocketDisconnect:
        global_manager.disconnect(websocket)

@app.post("/api/messenger/send_file")
async def send_file_message(chat_id: int = Form(...), user_id: int = Form(...), content: str = Form(""), files: list[UploadFile] = File([])):
    # Проверка доступа
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?", (chat_id, user_id))
        if not cur.fetchone():
            raise HTTPException(403, "Нет доступа к чату")
        # Имя отправителя
        cur.execute("SELECT username FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        sender_name = row[0] if row else "?"
        # Сохраняем файлы
        file_urls = []
        upload_dir = os.path.join("uploads", str(chat_id))
        os.makedirs(upload_dir, exist_ok=True)
        for file in files:
            ext = os.path.splitext(file.filename)[1].lower()
            fname = os.urandom(8).hex() + ext
            fpath = os.path.join(upload_dir, fname)
            with open(fpath, "wb") as out_file:
                out_file.write(await file.read())
            file_urls.append(f"/{fpath.replace('\\', '/')}" )
        # Вставка сообщения
        cur.execute("""
            INSERT INTO chat_messages (chat_id, sender_id, sender_name, content, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
        """, (chat_id, user_id, sender_name, content.strip() + ("\n[files] " + ", ".join(file_urls) if file_urls else "")))
        conn.commit()
    return {"success": True, "files": file_urls}

@app.post("/api/messenger/edit_chat")
async def edit_chat(request: Request):
    data = await request.json()
    chat_id = data.get("chat_id")
    title = data.get("title", "").strip()
    user_ids = data.get("user_ids", [])
    if not chat_id or not title or not user_ids:
        raise HTTPException(400, "chat_id, title, user_ids обязательны")
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()

        cur.execute("UPDATE chats SET title = ? WHERE id = ?", (title, chat_id))

        cur.execute("SELECT user_id FROM chat_members WHERE chat_id = ?", (chat_id,))
        current_ids = set(row[0] for row in cur.fetchall())
        new_ids = set(user_ids)

        for uid in new_ids - current_ids:
            cur.execute("INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, 'member')", (chat_id, uid))

        cur.execute("SELECT created_by FROM chats WHERE id = ?", (chat_id,))
        creator_row = cur.fetchone()
        creator_id = creator_row[0] if creator_row else None
        for uid in current_ids - new_ids:
            if uid != creator_id:
                cur.execute("DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?", (chat_id, uid))
        conn.commit()
    return {"success": True}

@app.get("/api/messenger/chat_members")
async def get_chat_members(chat_id: int):
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT u.id, u.username, u.avatar, m.role
            FROM chat_members m
            JOIN users u ON m.user_id = u.id
            WHERE m.chat_id = ?
        """, (chat_id,))
        members = [
            {"id": r[0], "username": r[1], "avatar": r[2], "role": r[3]} for r in cur.fetchall()
        ]
    return {"members": members}

@app.post("/api/messenger/create_private")
async def create_private_chat(request: Request):
    data = await request.json()
    user1 = data.get("user1_id")
    user2 = data.get("user2_id")
    if not user1 or not user2 or user1 == user2:
        raise HTTPException(400, "user1_id и user2_id обязательны и не должны совпадать")
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()

        cur.execute("""
            SELECT c.id FROM chats c
            JOIN chat_members m1 ON c.id = m1.chat_id AND m1.user_id = ?
            JOIN chat_members m2 ON c.id = m2.chat_id AND m2.user_id = ?
            WHERE c.type = 'private'
        """, (user1, user2))
        row = cur.fetchone()
        if row:
            return {"chat_id": row[0], "existed": True}

        cur.execute("""
            INSERT INTO chats (type, title, created_at, created_by)
            VALUES ('private', NULL, datetime('now'), ?)
        """, (user1,))
        chat_id = cur.lastrowid
        for uid in [user1, user2]:
            cur.execute("INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, 'member')", (chat_id, uid))
        conn.commit()
    return {"chat_id": chat_id, "existed": False}


@app.post("/api/messenger/delete_message")
async def delete_message(request: Request):
    data = await request.json()
    msg_id = data.get("msg_id")
    user_id = data.get("user_id")
    if not msg_id or not user_id:
        raise HTTPException(400, "msg_id и user_id обязательны")
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()

        cur.execute("SELECT chat_id, sender_id FROM chat_messages WHERE id = ?", (msg_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Сообщение не найдено")
        chat_id, sender_id = row

        is_author = (sender_id == user_id)
        cur.execute("SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?", (chat_id, user_id))
        role_row = cur.fetchone()
        is_admin = (role_row and role_row[0] == 'admin')
        if not (is_author or is_admin):
            raise HTTPException(403, "Нет прав на удаление")
        cur.execute("DELETE FROM chat_messages WHERE id = ?", (msg_id,))
        conn.commit()
    return {"success": True}

@app.post("/api/messenger/send")
async def send_message(request: Request):
    data = await request.json()
    chat_id = data.get("chat_id")
    user_id = data.get("user_id")
    content = data.get("content", "").strip()
    reply_to = data.get("reply_to")
    if not chat_id or not user_id or not content:
        raise HTTPException(400, "chat_id, user_id и content обязательны")

    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT username FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        sender_name = row[0] if row else "?"

        now = datetime.now(timezone.utc).isoformat()
        cur.execute("INSERT OR REPLACE INTO user_activity (user_id, last_message_sent) VALUES (?, ?)", (user_id, now))

        cur.execute(
            """
            INSERT INTO chat_messages (chat_id, sender_id, sender_name, content, created_at, reply_to)
            VALUES (?, ?, ?, ?, datetime('now'), ?)
            """,
            (chat_id, user_id, sender_name, content, reply_to),
        )
        conn.commit()
        msg_id = cur.lastrowid

        msg = {
            "id": msg_id,
            "chat_id": chat_id,
            "sender_id": user_id,
            "sender_name": sender_name,
            "content": content,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "reply_to": reply_to,
        }

        # Рассылка сообщения всем подключённым клиентам чата
        await manager.broadcast(chat_id, {"type": "new_message", "message": msg})

        # Рассылка уведомления всем глобальным клиентам
        await global_manager.broadcast({"type": "new_message", "chat_id": chat_id, "message": msg})

    return {"success": True}

@app.get("/api/messenger/messages")
async def get_chat_messages(chat_id: int, user_id: int, is_admin: bool = False):
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        if not is_admin:
            cur.execute("SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?", (chat_id, user_id))
            if not cur.fetchone():
                raise HTTPException(403, "Нет доступа к чату")
        cur.execute("""
            SELECT id, sender_id, sender_name, content, created_at, reply_to FROM chat_messages
            WHERE chat_id = ? ORDER BY id ASC
        """, (chat_id,))
        msgs = cur.fetchall()
    return [
        {"id": m[0], "sender_id": m[1], "sender_name": m[2], "content": m[3], "created_at": m[4], "reply_to": m[5]}
        for m in msgs
    ]

@app.post("/api/messenger/send")
async def send_message(request: Request):
    data = await request.json()
    chat_id = data.get("chat_id")
    user_id = data.get("user_id")
    content = data.get("content", "").strip()
    reply_to = data.get("reply_to")
    if not chat_id or not user_id or not content:
        raise HTTPException(400, "chat_id, user_id и content обязательны")
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()

        cur.execute("SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?", (chat_id, user_id))
        if not cur.fetchone():
            raise HTTPException(403, "Нет доступа к чату")

        cur.execute("SELECT username FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        sender_name = row[0] if row else "?"

        cur.execute("""
            INSERT INTO chat_messages (chat_id, sender_id, sender_name, content, created_at, reply_to)
            VALUES (?, ?, ?, ?, datetime('now'), ?)
        """, (chat_id, user_id, sender_name, content, reply_to))
        conn.commit()
    return {"success": True}

@app.post("/api/messenger/create_group")
async def create_group_chat(request: Request):
    data = await request.json()
    title = data.get("title", "").strip()
    user_ids = data.get("user_ids", [])
    creator_id = data.get("creator_id")
    if not title or not user_ids or not creator_id:
        raise HTTPException(400, "title, user_ids, creator_id обязательны")
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO chats (type, title, created_at, created_by)
            VALUES ('group', ?, datetime('now'), ?)
        """, (title, creator_id))
        chat_id = cur.lastrowid

        for uid in set(user_ids + [creator_id]):
            cur.execute("INSERT INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)", (chat_id, uid, 'admin' if uid == creator_id else 'member'))
        conn.commit()
    return {"success": True, "chat_id": chat_id}

@app.get("/api/countries/list")
async def get_countries_list():
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, name, taken_by FROM countries")
        countries = [
            {"id": r[0], "name": r[1], "taken_by": r[2]} for r in cur.fetchall()
        ]
    return countries

@app.get("/api/countries/taken")
async def get_taken_countries():
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, taken_by FROM countries WHERE taken_by IS NOT NULL")
        taken = cur.fetchall()
    return taken

@app.post("/api/users/{user_id}/reset_country")
async def reset_user_country(user_id: int):
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()

        cur.execute("SELECT country FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        if not row or not row[0]:
            return {"status": "ok"}
        country_id = row[0]

        cur.execute("UPDATE users SET country = NULL WHERE id = ?", (user_id,))

        cur.execute("UPDATE countries SET taken_by = NULL WHERE id = ? AND taken_by = ?", (country_id, user_id))
        conn.commit()
    return {"status": "ok"}


@app.post("/api/countries/register")
async def register_country(request: Request):
    data = await request.json()
    player_name = data.get("playerName", "").strip()
    country_id = data.get("countryId", "").strip()
    user_id = data.get("userId") or data.get("user_id")
    if user_id:
        with sqlite3.connect("site.db") as conn:
            cur = conn.cursor()
            cur.execute("SELECT username FROM users WHERE id = ?", (user_id,))
            row = cur.fetchone()
            if row:
                player_name = row[0]
    if not player_name or not country_id:
        return {"success": False, "error": "Заполните все поля"}
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()

        cur.execute("SELECT taken_by FROM countries WHERE id = ?", (country_id,))
        row = cur.fetchone()
        if row and row[0]:
            return {"success": False, "error": "Страна уже занята"}

        cur.execute("SELECT id FROM country_requests WHERE player_name = ? AND status = 'pending'", (player_name,))
        if cur.fetchone():
            return {"success": False, "error": "У вас уже есть активная заявка на страну. Дождитесь решения или отмените её."}

        cur.execute("SELECT id FROM country_requests WHERE player_name = ? AND country_id = ? AND status = 'pending'", (player_name, country_id))
        if cur.fetchone():
            return {"success": False, "error": "У вас уже есть заявка на эту страну"}

        cur.execute("INSERT INTO country_requests (player_name, country_id, created_at) VALUES (?, ?, ?)", (player_name, country_id, datetime.now(timezone.utc).isoformat()))
        conn.commit()
    return {"success": True}


@app.get("/api/countries/requests")
async def get_country_requests():
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, player_name, country_id, status FROM country_requests WHERE status = 'pending' ORDER BY created_at ASC")
        requests = [
            {"id": r[0], "player": r[1], "country": r[2], "status": r[3]}
            for r in cur.fetchall()
        ]
    return requests

@app.post("/api/countries/approve")
async def approve_country(request: Request):
    data = await request.json()
    req_id = data.get("id")
    if not req_id:
        return JSONResponse({"error": "Нет id заявки"}, status_code=400)
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        # Получить заявку
        cur.execute("SELECT player_name, country_id FROM country_requests WHERE id = ? AND status = 'pending'", (req_id,))
        row = cur.fetchone()
        if not row:
            return JSONResponse({"error": "Заявка не найдена"}, status_code=404)
        player_name, country_id = row

        cur.execute("SELECT id FROM users WHERE username = ?", (player_name,))
        user_row = cur.fetchone()
        user_id = user_row[0] if user_row else None

        cur.execute("SELECT taken_by FROM countries WHERE id = ?", (country_id,))
        taken_row = cur.fetchone()
        if taken_row and taken_row[0]:
            return JSONResponse({"error": "Страна уже занята"}, status_code=400)
        cur.execute("UPDATE users SET country = NULL WHERE country = ? AND id != ?", (country_id, user_id))

        cur.execute("UPDATE countries SET taken_by = ? WHERE id = ?", (user_id, country_id))
        if user_id:
            cur.execute("UPDATE users SET country = ? WHERE id = ?", (country_id, user_id))
        cur.execute("UPDATE country_requests SET status = 'approved' WHERE id = ?", (req_id,))
        conn.commit()
    return {"success": True}

@app.post("/api/countries/reject")
async def reject_country(request: Request):
    data = await request.json()
    req_id = data.get("id")
    if not req_id:
        return JSONResponse({"error": "Нет id заявки"}, status_code=400)
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        # Обновить заявку
        cur.execute("UPDATE country_requests SET status = 'rejected' WHERE id = ?", (req_id,))
        conn.commit()
    return {"success": True}

@app.get("/api/countries/my_request")
async def get_my_country_request(user_id: int = None, username: str = None):
    if not user_id and not username:
        return JSONResponse({"error": "user_id или username обязателен"}, status_code=400)
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        if user_id:
            cur.execute("SELECT username FROM users WHERE id = ?", (user_id,))
            row = cur.fetchone()
            if not row:
                return {"request": None}
            username = row[0]
        if not username:
            return {"request": None}
        cur.execute("SELECT id, country_id, status, created_at FROM country_requests WHERE player_name = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1", (username,))
        req = cur.fetchone()
        if not req:
            return {"request": None}
        return {"request": {"id": req[0], "country_id": req[1], "status": req[2], "created_at": req[3]}}

@app.post("/api/countries/edit_request")
async def edit_country_request(request: Request):
    data = await request.json()
    req_id = data.get("id")
    new_country_id = data.get("country_id")
    user_id = data.get("user_id")
    if not req_id or not new_country_id or not user_id:
        return JSONResponse({"error": "id, country_id, user_id обязательны"}, status_code=400)
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT player_name, status FROM country_requests WHERE id = ?", (req_id,))
        row = cur.fetchone()
        if not row:
            return JSONResponse({"error": "Заявка не найдена"}, status_code=404)
        player_name, status = row
        if status != 'pending':
            return JSONResponse({"error": "Заявка уже рассмотрена"}, status_code=400)
        cur.execute("SELECT username FROM users WHERE id = ?", (user_id,))
        user_row = cur.fetchone()
        if not user_row or user_row[0] != player_name:
            return JSONResponse({"error": "Нет доступа"}, status_code=403)
        cur.execute("SELECT taken_by FROM countries WHERE id = ?", (new_country_id,))
        c_row = cur.fetchone()
        if c_row and c_row[0]:
            return JSONResponse({"error": "Страна уже занята"}, status_code=400)
        cur.execute("SELECT id FROM country_requests WHERE country_id = ? AND status = 'pending' AND id != ?", (new_country_id, req_id))
        if cur.fetchone():
            return JSONResponse({"error": "На эту страну уже есть заявка"}, status_code=400)
        # Обновить страну в заявке
        cur.execute("UPDATE country_requests SET country_id = ? WHERE id = ?", (new_country_id, req_id))
        conn.commit()
    return {"success": True}


@app.post("/api/countries/delete_request")
async def delete_country_request(request: Request):
    data = await request.json()
    req_id = data.get("id")
    user_id = data.get("user_id")
    if not req_id or not user_id:
        return JSONResponse({"error": "id, user_id обязательны"}, status_code=400)
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()

        cur.execute("SELECT player_name, status FROM country_requests WHERE id = ?", (req_id,))
        row = cur.fetchone()
        if not row:
            return JSONResponse({"error": "Заявка не найдена"}, status_code=404)
        player_name, status = row
        if status != 'pending':
            return JSONResponse({"error": "Заявка уже рассмотрена"}, status_code=400)

        cur.execute("SELECT username FROM users WHERE id = ?", (user_id,))
        user_row = cur.fetchone()
        if not user_row or user_row[0] != player_name:
            return JSONResponse({"error": "Нет доступа"}, status_code=403)

        cur.execute("DELETE FROM country_requests WHERE id = ?", (req_id,))
        conn.commit()
    return {"success": True}

@app.post("/api/messenger/visit")
async def messenger_visit(user=Depends(require_user)):
    user_id = user["id"]
    now = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO user_activity (user_id, last_messenger_visit) VALUES (?, ?)", (user_id, now))
        conn.commit()
    return {"success": True}

@app.get("/api/users/activity")
async def get_users_activity(user=Depends(require_admin)):
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, username FROM users ORDER BY id")
        users = cur.fetchall()
        cur.execute("SELECT user_id, last_messenger_visit, last_message_sent FROM user_activity")
        activity = {row[0]: {"last_messenger_visit": row[1], "last_message_at": row[2]} for row in cur.fetchall()}
        result = []
        for u in users:
            uid = u[0]
            act = activity.get(uid, {})
            result.append({
                "id": uid,
                "username": u[1],
                "last_messenger_visit": act.get("last_messenger_visit"),
                "last_message_at": act.get("last_message_at")
            })
        return {"status": "ok", "users": result}


@app.post("/api/logout")
async def logout():

    return {"status": "ok"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://79.174.78.128"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DB: инициализация таблиц (однократно)
def init_db():
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        # ...создание таблиц...
        cur.execute("""CREATE TABLE IF NOT EXISTS user_activity (
            user_id INTEGER PRIMARY KEY,
            last_messenger_visit TEXT,
            last_message_sent TEXT
        )""")
        cur.execute("""CREATE TABLE IF NOT EXISTS news (
            id TEXT PRIMARY KEY,
            author TEXT,
            content TEXT,
            date TEXT,
            author_id TEXT,
            avatar TEXT,
            attachments TEXT
        )""")
        cur.execute("""CREATE TABLE IF NOT EXISTS forum_topics (
            id TEXT PRIMARY KEY,
            title TEXT,
            author TEXT,
            author_id TEXT,
            avatar TEXT,
            date TEXT
        )""")
        cur.execute("""CREATE TABLE IF NOT EXISTS forum_messages (
            id TEXT PRIMARY KEY,
            topic_id TEXT,
            author TEXT,
            author_id TEXT,
            avatar TEXT,
            content TEXT,
            date TEXT,
            attachments TEXT
        )""")
        cur.execute("""CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            role TEXT DEFAULT 'user',
            created_at TEXT,
            avatar TEXT DEFAULT '',
            country TEXT DEFAULT NULL
        )""")
        try:
            cur.execute("ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''")
        except Exception:
            pass
        try:
            cur.execute("ALTER TABLE users ADD COLUMN country TEXT DEFAULT NULL")
        except Exception:
            pass
        cur.execute("""CREATE TABLE IF NOT EXISTS news_comments (
            id TEXT PRIMARY KEY,
            news_id TEXT,
            author TEXT,
            author_id TEXT,
            avatar TEXT,
            content TEXT,
            date TEXT
        )""")
        cur.execute("""CREATE TABLE IF NOT EXISTS news_likes (
            id TEXT PRIMARY KEY,
            news_id TEXT,
            user_id TEXT,
            value INTEGER -- 1 = like, -1 = dislike
        )""")
        cur.execute("""CREATE TABLE IF NOT EXISTS forum_likes (
            id TEXT PRIMARY KEY,
            message_id TEXT,
            user_id TEXT,
            value INTEGER -- 1 = like, -1 = dislike
        )""")
        conn.commit()
        # --- Таблица стран ---
        cur.execute("""CREATE TABLE IF NOT EXISTS countries (
            id TEXT PRIMARY KEY,
            name TEXT,
            taken_by INTEGER DEFAULT NULL -- user_id
        )""")
        # --- Автоматическая инициализация стран ---
        default_countries = [
            ("hom", "Хомасия"),
            ("bgg", "Бурград"),
            ("myr", "Миртания"),
            ("tdv", "Трудовия"),
            ("ktv", "Крастовия")
        ]
        cur.execute("SELECT COUNT(*) FROM countries")
        count = cur.fetchone()[0]
        if count == 0:
            cur.executemany("INSERT INTO countries (id, name) VALUES (?, ?)", default_countries)
            conn.commit()
        # --- Таблица заявок на регистрацию страны ---
        cur.execute("""CREATE TABLE IF NOT EXISTS country_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER,
            player_name TEXT,
            country_id TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT
        )""")

        # --- Таблицы для мессенджера ---
        cur.execute("""CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT DEFAULT 'private', -- private, group
            title TEXT,
            created_at TEXT,
            created_by INTEGER
        )""")
        cur.execute("""CREATE TABLE IF NOT EXISTS chat_members (
            chat_id INTEGER,
            user_id INTEGER,
            role TEXT DEFAULT 'member', -- member, admin
            PRIMARY KEY (chat_id, user_id)
        )""")
        cur.execute("""CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER,
            sender_id INTEGER,
            sender_name TEXT,
            content TEXT,
            created_at TEXT
        )""")
        # --- Таблица для отслеживания прочитанных сообщений ---
        cur.execute("""CREATE TABLE IF NOT EXISTS chat_reads (
            user_id INTEGER,
            chat_id INTEGER,
            last_read_msg_id INTEGER,
            PRIMARY KEY (user_id, chat_id)
        )""")
import os
from fastapi import UploadFile, File, Form

# --- API: отправить сообщение с файлами ---
@app.post("/api/messenger/send_file")
async def send_file_message(chat_id: int = Form(...), user_id: int = Form(...), content: str = Form(""), files: list[UploadFile] = File([])):
    reply_to = None
    try:
        reply_to = int(Form("reply_to"))
    except Exception:
        reply_to = None
    # Проверка доступа
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?", (chat_id, user_id))
        if not cur.fetchone():
            raise HTTPException(403, "Нет доступа к чату")
        # Имя отправителя
        cur.execute("SELECT username FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        sender_name = row[0] if row else "?"
        # Сохраняем файлы
        file_urls = []
        upload_dir = os.path.join("uploads", str(chat_id))
        os.makedirs(upload_dir, exist_ok=True)
        for file in files:
            ext = os.path.splitext(file.filename)[1].lower()
            fname = os.urandom(8).hex() + ext
            fpath = os.path.join(upload_dir, fname)
            with open(fpath, "wb") as out_file:
                out_file.write(await file.read())
            file_urls.append(f"/{fpath.replace('\\', '/')}" )
        # Вставка сообщения
        cur.execute("""
            INSERT INTO chat_messages (chat_id, sender_id, sender_name, content, created_at, reply_to)
            VALUES (?, ?, ?, ?, datetime('now'), ?)
        """, (chat_id, user_id, sender_name, content.strip() + ("\n[files] " + ", ".join(file_urls) if file_urls else ""), reply_to))
        conn.commit()
    return {"success": True, "files": file_urls}

import shutil
@app.post("/api/account/change_password")
async def change_password(request: Request):
    data = await request.json()
    user_id = data.get("user_id")
    old_password = data.get("old_password", "").strip()
    new_password = data.get("new_password", "").strip()
    if not user_id or not old_password or not new_password:
        return JSONResponse({"error": "Не все поля заполнены"}, status_code=400)
    if len(new_password) < 4:
        return JSONResponse({"error": "Пароль слишком короткий"}, status_code=400)
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        if not row or not bcrypt.verify(old_password, row[0]):
            return JSONResponse({"error": "Старый пароль неверен"}, status_code=403)
        new_hash = bcrypt.hash(new_password)
        cur.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user_id))
        conn.commit()
    return {"status": "ok"}

# API для загрузки аватарки
@app.post("/api/account/upload_avatar")
async def upload_avatar(user_id: int = Form(...), file: UploadFile = File(...)):
    # Проверка типа файла
    if not file.content_type.startswith("image/"):
        return JSONResponse({"error": "Можно загружать только изображения"}, status_code=400)
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        return JSONResponse({"error": "Разрешены только jpg, png, webp"}, status_code=400)
    # Папка для аватарок
    upload_dir = os.path.join("uploads", str(user_id))
    os.makedirs(upload_dir, exist_ok=True)
    avatar_path = os.path.join(upload_dir, "avatar" + ext)
    with open(avatar_path, "wb") as out_file:
        shutil.copyfileobj(file.file, out_file)
    # Сохраняем путь в БД (относительно корня)
    avatar_url = f"/{avatar_path.replace('\\', '/')}"
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("UPDATE users SET avatar = ? WHERE id = ?", (avatar_url, user_id))
        conn.commit()
    return {"status": "ok", "avatar": avatar_url}

init_db()

# --- API для лайков/дизлайков сообщений форума ---
@app.get("/api/forum/message/{message_id}/likes")
def get_forum_message_likes(message_id: str):
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT value, COUNT(*) FROM forum_likes WHERE message_id = ? GROUP BY value", (message_id,))
        result = {"like": 0, "dislike": 0}
        for value, count in cur.fetchall():
            if value == 1:
                result["like"] = count
            elif value == -1:
                result["dislike"] = count
        return result

@app.post("/api/forum/message/{message_id}/like")
async def like_forum_message(message_id: str, request: Request):
    data = await request.json()
    user_id = data.get("user_id", "0")
    value = data.get("value", 1)  # 1 = like, -1 = dislike
    like_id = f"{message_id}_{user_id}"
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("REPLACE INTO forum_likes (id, message_id, user_id, value) VALUES (?, ?, ?, ?)",
                    (like_id, message_id, user_id, value))
        conn.commit()
    return {"status": "ok"}


# --- Регистрация ---
@app.post("/api/register")
async def register(request: Request):
    data = await request.json()
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    if not username or not password:
        return JSONResponse({"error": "Пустой логин или пароль"}, status_code=400)
    if len(username) < 3 or len(password) < 4:
        return JSONResponse({"error": "Слишком короткий логин или пароль"}, status_code=400)
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM users WHERE username = ?", (username,))
        if cur.fetchone():
            return JSONResponse({"error": "Пользователь уже существует"}, status_code=400)
        password_hash = bcrypt.hash(password)
        cur.execute(
            "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
            (username, password_hash, "user", datetime.now(timezone.utc).isoformat())
        )
        conn.commit()
        user_id = cur.lastrowid
    user = {"id": user_id, "username": username, "role": "user"}
    token = create_jwt_token(user)
    return {"status": "ok", "user": user, "token": token}


# --- Логин ---
@app.post("/api/login")
async def login(request: Request):
    data = await request.json()
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, username, password_hash, role, country, avatar FROM users WHERE username = ?", (username,))
        row = cur.fetchone()
        if not row or not bcrypt.verify(password, row[2]):
            return JSONResponse({"error": "Неверный логин или пароль"}, status_code=401)
        user = {
            "id": row[0],
            "username": row[1],
            "role": row[3],
            "country": row[4],
            "avatar": row[5] or ""
        }
        token = create_jwt_token(user)
    return {"status": "ok", "user": user, "token": token}


# --- Только для админа ---
@app.get("/api/users")
async def get_users(user=Depends(require_admin)):
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, username, role, created_at, country FROM users ORDER BY id")
        users = [
            {"id": r[0], "username": r[1], "role": r[2], "created_at": r[3], "country": r[4]}
            for r in cur.fetchall()
        ]
    return {"status": "ok", "users": users}


@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int, user=Depends(require_admin)):
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
    return {"status": "ok"}


@app.get("/api/news")
def get_news():
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM news ORDER BY date DESC")
        rows = cur.fetchall()
        return [
            {"id": r[0], "author": r[1], "content": r[2], "date": r[3],
             "author_id": r[4], "avatar": r[5], "attachments": r[6]}
            for r in rows
        ]


@app.post("/api/news/create")
async def create_news(request: Request):
    data = await request.json()
    author_id = data.get("author_id")
    if not author_id:
        return JSONResponse({"error": "Нет ID пользователя"}, status_code=403)
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT role FROM users WHERE id = ?", (author_id,))
        row = cur.fetchone()
        if not row or row[0] != "admin":
            return JSONResponse({"error": "Только админ может публиковать новости"}, status_code=403)
        news_id = data.get("id", os.urandom(8).hex())
        cur.execute(
            "INSERT OR IGNORE INTO news VALUES (?,?,?,?,?,?,?)",
            (
                news_id,
                data.get("author", "site-admin"),
                data.get("content", ""),
                data.get("date", datetime.now(timezone.utc).isoformat()),
                data.get("author_id", "0"),
                data.get("avatar", ""),
                data.get("attachments", ""),
            ),
        )
        conn.commit()
    return {"status": "ok", "id": news_id}

# --- API для комментариев к новостям ---
@app.get("/api/news/{news_id}/comments")
def get_news_comments(news_id: str):
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM news_comments WHERE news_id = ? ORDER BY date ASC", (news_id,))
        rows = cur.fetchall()
        return [
            {"id": r[0], "news_id": r[1], "author": r[2], "author_id": r[3], "avatar": r[4], "content": r[5], "date": r[6]}
            for r in rows
        ]

@app.post("/api/news/{news_id}/comments/add")
async def add_news_comment(news_id: str, request: Request):
    data = await request.json()
    comment_id = os.urandom(8).hex()
    if not data.get("content", "").strip():
        return {"status": "error", "message": "Пустой комментарий"}
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT OR IGNORE INTO news_comments VALUES (?,?,?,?,?,?,?)",
            (
                comment_id,
                news_id,
                data.get("author", "anon"),
                data.get("author_id", "0"),
                data.get("avatar", ""),
                data.get("content", ""),
                data.get("date", datetime.now(timezone.utc).isoformat()),
            ),
        )
        conn.commit()
    return {"status": "ok", "id": comment_id}

# --- API для лайков/дизлайков новостей ---
@app.get("/api/news/{news_id}/likes")
def get_news_likes(news_id: str):
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT value, COUNT(*) FROM news_likes WHERE news_id = ? GROUP BY value", (news_id,))
        result = {"like": 0, "dislike": 0}
        for value, count in cur.fetchall():
            if value == 1:
                result["like"] = count
            elif value == -1:
                result["dislike"] = count
        return result

@app.post("/api/news/{news_id}/like")
async def like_news(news_id: str, request: Request):
    data = await request.json()
    user_id = data.get("user_id", "0")
    value = data.get("value", 1)
    like_id = f"{news_id}_{user_id}"
    # Обновить или вставить
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("REPLACE INTO news_likes (id, news_id, user_id, value) VALUES (?, ?, ?, ?)",
                    (like_id, news_id, user_id, value))
        conn.commit()
    return {"status": "ok"}

@app.get("/api/forum/topics")
def get_topics():
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM forum_topics ORDER BY date DESC")
        rows = cur.fetchall()
        return [
            {"id": r[0], "title": r[1], "author": r[2], "author_id": r[3],
             "avatar": r[4], "date": r[5]}
            for r in rows
        ]

@app.post("/api/forum/topics/create")
async def create_topic(request: Request):
    data = await request.json()
    # Только залогиненный пользователь может создавать тему
    author_id = data.get("author_id")
    if not author_id:
        return JSONResponse({"error": "Нет ID пользователя"}, status_code=403)
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT username, avatar FROM users WHERE id = ?", (author_id,))
        row = cur.fetchone()
        if not row:
            return JSONResponse({"error": "Пользователь не найден"}, status_code=403)
        username, avatar = row
        topic_id = data.get("id", os.urandom(8).hex())
        cur.execute(
            "INSERT OR IGNORE INTO forum_topics VALUES (?,?,?,?,?,?)",
            (
                topic_id,
                data.get("title", "Без названия"),
                username,
                author_id,
                avatar or "",
                data.get("date", datetime.now(timezone.utc).isoformat()),
            ),
        )
        conn.commit()
    return {"status": "ok", "id": topic_id}

@app.get("/api/forum/topic/{topic_id}")
def get_messages(topic_id: str):
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM forum_messages WHERE topic_id = ? ORDER BY date ASC", (topic_id,))
        rows = cur.fetchall()
        return [
            {"id": r[0], "topic_id": r[1], "author": r[2], "author_id": r[3],
             "avatar": r[4], "content": r[5], "date": r[6], "attachments": r[7]}
            for r in rows
        ]

@app.post("/api/forum/topic/{topic_id}/reply")
async def reply_topic(topic_id: str, request: Request):
    data = await request.json()
    # Только залогиненный пользователь может отвечать
    author_id = data.get("author_id")
    if not author_id:
        return JSONResponse({"error": "Нет ID пользователя"}, status_code=403)
    if not data.get("content", "").strip():
        return {"status": "error", "message": "Пустое сообщение"}
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT username, avatar FROM users WHERE id = ?", (author_id,))
        row = cur.fetchone()
        if not row:
            return JSONResponse({"error": "Пользователь не найден"}, status_code=403)
        username, avatar = row
        msg_id = data.get("id", os.urandom(8).hex())
        cur.execute(
            "INSERT OR IGNORE INTO forum_messages VALUES (?,?,?,?,?,?,?,?)",
            (
                msg_id,
                topic_id,
                username,
                author_id,
                avatar or "",
                data.get("content", ""),
                data.get("date", datetime.now(timezone.utc).isoformat()),
                data.get("attachments", ""),
            ),
        )
        conn.commit()
    return {"status": "ok", "id": msg_id}

# --- API: отметить чат как прочитанный ---
@app.post("/api/messenger/read_chat")
async def read_chat(request: Request):
    data = await request.json()
    chat_id = data.get("chat_id")
    user_id = data.get("user_id")
    last_msg_id = data.get("last_msg_id")
    if not chat_id or not user_id or not last_msg_id:
        return JSONResponse({"error": "Missing params"}, status_code=400)
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        # Найти максимальный id чужого сообщения (от других пользователей)
        cur.execute("SELECT MAX(id) FROM chat_messages WHERE chat_id=? AND sender_id != ? AND id <= ?", (chat_id, user_id, last_msg_id))
        max_other_id = cur.fetchone()[0] or 0
        cur.execute("REPLACE INTO chat_reads (user_id, chat_id, last_read_msg_id) VALUES (?, ?, ?)", (user_id, chat_id, max_other_id))
        conn.commit()
    return {"success": True}

# --- Обновление статуса сообщений как прочитанных для отправителя ---
@app.post("/api/messenger/mark_as_read")
async def mark_as_read(chat_id: int, user_id: int):
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        # Обновляем последний прочитанный ID сообщения для отправителя
        cur.execute(
            """
            UPDATE chat_reads
            SET last_read_msg_id = (
                SELECT MAX(id) FROM chat_messages WHERE chat_id = ?
            )
            WHERE user_id = ? AND chat_id = ?
        """,
            (chat_id, user_id, chat_id),
        )
        conn.commit()
    return {"success": True}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
