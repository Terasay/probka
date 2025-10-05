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
        )""")
        # Миграция: если столбца avatar нет, добавить
        try:
            cur.execute("ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''")
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
        cur.execute("SELECT id, username, password_hash, role FROM users WHERE username = ?", (username,))
        row = cur.fetchone()
        if not row or not bcrypt.verify(password, row[2]):
            return JSONResponse({"error": "Неверный логин или пароль"}, status_code=401)
        user = {"id": row[0], "username": row[1], "role": row[3]}
    return {"status": "ok", "user": user}

@app.get("/api/users")
async def get_users():
    with sqlite3.connect("site.db") as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, username, role, created_at FROM users ORDER BY id")
        users = [
            {"id": r[0], "username": r[1], "role": r[2], "created_at": r[3]}
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
        cur.execute("SELECT username FROM users WHERE id = ?", (author_id,))
        row = cur.fetchone()
        if not row:
            return JSONResponse({"error": "Пользователь не найден"}, status_code=403)
        topic_id = data.get("id", os.urandom(8).hex())
        cur.execute(
            "INSERT OR IGNORE INTO forum_topics VALUES (?,?,?,?,?,?)",
            (
                topic_id,
                data.get("title", "Без названия"),
                data.get("author", row[0]),
                data.get("author_id", author_id),
                data.get("avatar", ""),
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
        cur.execute("SELECT username FROM users WHERE id = ?", (author_id,))
        row = cur.fetchone()
        if not row:
            return JSONResponse({"error": "Пользователь не найден"}, status_code=403)
        msg_id = os.urandom(8).hex()
        cur.execute(
            "INSERT OR IGNORE INTO forum_messages VALUES (?,?,?,?,?,?,?,?)",
            (
                msg_id,
                topic_id,
                row[0],
                author_id,
                data.get("avatar", ""),
                data.get("content", ""),
                data.get("date", datetime.now(timezone.utc).isoformat()),
                data.get("attachments", ""),
            ),
        )
        conn.commit()
    return {"status": "ok", "id": msg_id}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
