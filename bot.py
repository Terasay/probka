import sqlite3
from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import uvicorn
import os
from passlib.hash import bcrypt
from datetime import datetime, timedelta, timezone
import jwt
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

SECRET_KEY = "your_super_secret_key_here_change_it"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

conn = sqlite3.connect("site.db", check_same_thread=False)
cur = conn.cursor()

# Таблицы (без изменений)
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

from fastapi.responses import JSONResponse

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    logger.info(f"Created JWT for user_id: {data.get('user_id')}, role: {data.get('role')}")
    return encoded_jwt

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    logger.info(f"Received token: {token[:10]}... (truncated for security)")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("user_id")
        role: str = payload.get("role")
        logger.info(f"Decoded token: user_id={user_id}, role={role}")
        if user_id is None or role is None:
            logger.error("Invalid token: missing user_id or role")
            raise HTTPException(status_code=401, detail="Неверный токен")
        return {"user_id": user_id, "role": role.lower()}  # Приводим роль к нижнему регистру
    except jwt.ExpiredSignatureError:
        logger.error("Token expired")
        raise HTTPException(status_code=401, detail="Токен истёк")
    except jwt.InvalidTokenError as e:
        logger.error(f"Invalid token: {str(e)}")
        raise HTTPException(status_code=401, detail="Неверный токен")

@app.get("/api/users")
async def get_users(current_user: dict = Depends(get_current_user)):
    logger.info(f"Checking access for user_id={current_user['user_id']}, role={current_user['role']}")
    if current_user["role"] != "admin":
        logger.warning(f"Access denied for user_id={current_user['user_id']}, role={current_user['role']}")
        raise HTTPException(status_code=403, detail="Только для админа")
    cur.execute("SELECT id, username, role, created_at FROM users ORDER BY id")
    users = [
        {"id": r[0], "username": r[1], "role": r[2], "created_at": r[3]}
        for r in cur.fetchall()
    ]
    return {"users": users}

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int, current_user: dict = Depends(get_current_user)):
    logger.info(f"Delete attempt by user_id={current_user['user_id']}, role={current_user['role']}")
    if current_user["role"] != "admin":
        logger.warning(f"Delete denied for user_id={current_user['user_id']}, role={current_user['role']}")
        raise HTTPException(status_code=403, detail="Только для админа")
    cur.execute("SELECT id FROM users WHERE id = ?", (user_id,))
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    cur.execute("DELETE FROM users WHERE id = ?", (user_id,))
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
    cur.execute("SELECT id FROM users WHERE username = ?", (username,))
    if cur.fetchone():
        return JSONResponse({"error": "Пользователь уже существует"}, status_code=400)
    try:
        password_hash = bcrypt.hash(password)
    except Exception as e:
        logger.error(f"Bcrypt error: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка хеширования пароля")
    created_at = datetime.now(timezone.utc).isoformat()
    cur.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, password_hash, created_at)
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
    if not row:
        logger.warning(f"Login failed: user {username} not found")
        return JSONResponse({"error": "Неверный логин или пароль"}, status_code=401)
    try:
        if not bcrypt.verify(password, row[2]):
            logger.warning(f"Login failed: invalid password for {username}")
            return JSONResponse({"error": "Неверный логин или пароль"}, status_code=401)
    except Exception as e:
        logger.error(f"Bcrypt verify error: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка проверки пароля")
    user = {"id": row[0], "username": row[1], "role": row[3].lower()}  # Приводим роль к нижнему регистру
    access_token = create_access_token({"user_id": user["id"], "role": user["role"]})
    logger.info(f"Login successful: {username}, role={user['role']}")
    return {"status": "ok", "user": user, "access_token": access_token}

# CORS (без изменений)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Остальные эндпоинты (без изменений)
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
            data.get("date", ""),
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
            data.get("date", ""),
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
            data.get("date", ""),
            data.get("attachments", ""),
        ),
    )
    conn.commit()
    return {"status": "ok", "id": msg_id}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)