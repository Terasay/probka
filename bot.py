import sqlite3
import secrets
import os
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from passlib.hash import bcrypt
import uvicorn
import logging

# Логирование
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Middleware для логирования запросов и headers
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Request path: {request.url.path}")
    logger.info(f"Request headers: {dict(request.headers)}")  # Покажет все headers, включая Authorization
    response = await call_next(request)
    logger.info(f"Response status: {response.status_code}")
    return response

conn = sqlite3.connect("site.db", check_same_thread=False)
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

cur.execute("""CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'user',
    created_at TEXT
)""")

cur.execute("""CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER,
    created_at TEXT
)""")

conn.commit()

# Утилита: получение юзера по токену
async def get_current_user(request: Request):
    auth = request.headers.get("authorization")  # Нижний регистр, на случай если прокси меняет
    if not auth or not auth.startswith("Bearer "):
        logger.warning("No or invalid Authorization header")
        raise HTTPException(status_code=401, detail="Нет токена")

    token = auth.split(" ")[1]
    logger.info(f"Extracted token (length): {len(token)}")  # Для отладки

    # Optional: cleanup старых сессий (удаляем >1 часа)
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    cur.execute("DELETE FROM sessions WHERE created_at < ?", (one_hour_ago.isoformat(),))
    conn.commit()

    cur.execute("SELECT user_id FROM sessions WHERE token = ?", (token,))
    row = cur.fetchone()
    if not row:
        logger.warning("Token not found in sessions")
        raise HTTPException(status_code=401, detail="Неверный токен")

    cur.execute("SELECT id, username, role FROM users WHERE id = ?", (row[0],))
    user = cur.fetchone()
    if not user:
        logger.warning("User not found for token")
        raise HTTPException(status_code=401, detail="Пользователь не найден")

    return {"id": user[0], "username": user[1], "role": user[2]}

@app.post("/api/register")
async def register(request: Request):
    data = await request.json()
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    if not username or not password:
        return JSONResponse({"error": "Пустой логин или пароль"}, status_code=400)
    if len(username) < 3 or len(password) < 4:
        return JSONResponse({"error": "Слишком короткий логин или пароль"}, status_code=400)

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

    cur.execute("SELECT id, username, password_hash, role FROM users WHERE username = ?", (username,))
    row = cur.fetchone()
    if not row or not bcrypt.verify(password, row[2]):
        return JSONResponse({"error": "Неверный логин или пароль"}, status_code=401)

    token = secrets.token_hex(16)
    cur.execute("INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)",
                (token, row[0], datetime.now(timezone.utc).isoformat()))
    conn.commit()

    user = {"id": row[0], "username": row[1], "role": row[3]}
    return {"status": "ok", "user": user, "token": token}

@app.get("/api/users")
async def get_users(request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Только для админа")

    cur.execute("SELECT id, username, role, created_at FROM users ORDER BY id")
    users = [
        {"id": r[0], "username": r[1], "role": r[2], "created_at": r[3]}
        for r in cur.fetchall()
    ]
    return users

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int, request: Request):
    user = await get_current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Только для админа")

    cur.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    return {"status": "ok"}

@app.get("/api/news")
def get_news():
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

@app.get("/api/forum/topics")
def get_topics():
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
    topic_id = data.get("id", os.urandom(8).hex())
    cur.execute(
        "INSERT OR IGNORE INTO forum_topics VALUES (?,?,?,?,?,?)",
        (
            topic_id,
            data.get("title", "Без названия"),
            data.get("author", "site-admin"),
            data.get("author_id", "0"),
            data.get("avatar", ""),
            data.get("date", datetime.now(timezone.utc).isoformat()),
        ),
    )
    conn.commit()
    return {"status": "ok", "id": topic_id}

@app.get("/api/forum/topic/{topic_id}")
def get_messages(topic_id: str):
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
    msg_id = os.urandom(8).hex()
    if not data.get("content", "").strip():
        return {"status": "error", "message": "Пустое сообщение"}
    cur.execute(
        "INSERT OR IGNORE INTO forum_messages VALUES (?,?,?,?,?,?,?,?)",
        (
            msg_id,
            topic_id,
            data.get("author", "site-admin"),
            data.get("author_id", "0"),
            data.get("avatar", ""),
            data.get("content", ""),
            data.get("date", datetime.now(timezone.utc).isoformat()),
            data.get("attachments", ""),
        ),
    )
    conn.commit()
    return {"status": "ok", "id": msg_id}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "Authorization"],
)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)