import sqlite3
import os
from datetime import datetime, timezone
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from passlib.hash import bcrypt
import uvicorn
import logging

# Логирование
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS (разрешаем доступ с твоего IP)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://79.174.78.128"],  # твой фронтенд
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DB
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

conn.commit()

# ===================== AUTH =====================

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

    user = {"id": row[0], "username": row[1], "role": row[3]}
    return {"status": "ok", "user": user}

@app.get("/api/users")
async def get_users():
    cur.execute("SELECT id, username, role, created_at FROM users ORDER BY id")
    users = [
        {"id": r[0], "username": r[1], "role": r[2], "created_at": r[3]}
        for r in cur.fetchall()
    ]
    return {"status": "ok", "users": users}

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int):
    cur.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    return {"status": "ok"}

# ===================== NEWS =====================

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

# ===================== FORUM =====================

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

# ===================== START =====================

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
