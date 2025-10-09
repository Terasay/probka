from fastapi import Depends
import sqlite3
import os
from datetime import datetime, timezone
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from passlib.hash import bcrypt
import uvicorn
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


app = FastAPI()

# --- API: получить список занятых стран ---
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
        # Получить текущую страну пользователя
        cur.execute("SELECT country FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        if not row or not row[0]:
            return {"status": "ok"}  # Уже сброшено
        country_id = row[0]
        # Сбросить страну у пользователя
        cur.execute("UPDATE users SET country = NULL WHERE id = ?", (user_id,))
        # Освободить страну в таблице стран
        cur.execute("UPDATE countries SET taken_by = NULL WHERE id = ? AND taken_by = ?", (country_id, user_id))
        conn.commit()
    return {"status": "ok"}
# --- API: подать заявку на регистрацию страны ---
@app.post("/api/countries/register")
async def register_country(request: Request):
    data = await request.json()
    player_name = data.get("playerName", "").strip()
    country_id = data.get("countryId", "").strip()
    if not player_name or not country_id:
        return {"success": False, "error": "Заполните все поля"}
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        # Проверить, занята ли страна
        cur.execute("SELECT taken_by FROM countries WHERE id = ?", (country_id,))
        row = cur.fetchone()
        if row and row[0]:
            return {"success": False, "error": "Страна уже занята"}
        # Проверить, есть ли уже заявка от этого игрока на эту страну в статусе pending
        cur.execute("SELECT id FROM country_requests WHERE player_name = ? AND country_id = ? AND status = 'pending'", (player_name, country_id))
        if cur.fetchone():
            return {"success": False, "error": "У вас уже есть заявка на эту страну"}
        # Добавить заявку
        cur.execute("INSERT INTO country_requests (player_name, country_id, created_at) VALUES (?, ?, ?)", (player_name, country_id, datetime.now(timezone.utc).isoformat()))
        conn.commit()
    return {"success": True}

# --- API: получить список заявок на регистрацию страны (только для админа) ---
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

# --- API: одобрить заявку (только для админа) ---
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
        # Найти пользователя по имени
        cur.execute("SELECT id FROM users WHERE username = ?", (player_name,))
        user_row = cur.fetchone()
        user_id = user_row[0] if user_row else None
        # Если страна уже занята, отказать
        cur.execute("SELECT taken_by FROM countries WHERE id = ?", (country_id,))
        taken_row = cur.fetchone()
        if taken_row and taken_row[0]:
            return JSONResponse({"error": "Страна уже занята"}, status_code=400)
        # Перед выдачей страны новому пользователю, сбросить её у всех других пользователей
        cur.execute("UPDATE users SET country = NULL WHERE country = ? AND id != ?", (country_id, user_id))
        # Пометить страну как занятую
        cur.execute("UPDATE countries SET taken_by = ? WHERE id = ?", (user_id, country_id))
        # Записать страну в профиль пользователя
        if user_id:
            cur.execute("UPDATE users SET country = ? WHERE id = ?", (country_id, user_id))
        # Обновить заявку
        cur.execute("UPDATE country_requests SET status = 'approved' WHERE id = ?", (req_id,))
        conn.commit()
    return {"success": True}

# --- API: отклонить заявку (только для админа) ---
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

# --- API logout (заглушка) ---
@app.post("/api/logout")
async def logout():
    # Заглушка: просто возвращаем OK, т.к. сессий на сервере нет
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
        # Добавляем avatar в users, если его нет
        cur.execute("""CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            role TEXT DEFAULT 'user',
            created_at TEXT,
            avatar TEXT DEFAULT ''
            , country TEXT DEFAULT NULL
        )""")
        # Миграция: если столбца avatar нет, добавить
        try:
            cur.execute("ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''")
        except Exception:
            pass
        # Миграция: если столбца country нет, добавить
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
        # --- Таблица заявок на регистрацию страны ---
        cur.execute("""CREATE TABLE IF NOT EXISTS country_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER,
            player_name TEXT,
            country_id TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT
        )""")
from fastapi import UploadFile, File, Form
import shutil
import os
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
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, password_hash, datetime.now(timezone.utc).isoformat())
        )
        conn.commit()
    return {"status": "ok"}

@app.post("/api/login")
async def login(request: Request):
    data = await request.json()
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, username, password_hash, role, country FROM users WHERE username = ?", (username,))
        row = cur.fetchone()
        if not row or not bcrypt.verify(password, row[2]):
            return JSONResponse({"error": "Неверный логин или пароль"}, status_code=401)
        user = {"id": row[0], "username": row[1], "role": row[3], "country": row[4]}
    return {"status": "ok", "user": user}

@app.get("/api/users")
async def get_users():
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, username, role, created_at, country FROM users ORDER BY id")
        users = [
            {"id": r[0], "username": r[1], "role": r[2], "created_at": r[3], "country": r[4]}
            for r in cur.fetchall()
        ]
    return {"status": "ok", "users": users}

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int):
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
    # Проверка: только админ может публиковать новости
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
    value = data.get("value", 1)  # 1 = like, -1 = dislike
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

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
