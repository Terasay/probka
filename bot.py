import sqlite3
from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import uvicorn
import os
from passlib.hash import bcrypt
from datetime import datetime, timedelta
import jwt  # PyJWT

app = FastAPI()

# Секретный ключ для JWT (в проде — из env: os.getenv('SECRET_KEY'))
SECRET_KEY = "your_super_secret_key_here_change_it"  # Смени на случайный!
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # Токен истекает через 1 час

conn = sqlite3.connect("site.db", check_same_thread=False)
cur = conn.cursor()

# Создание таблиц (твой код, без изменений)
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

# Функция для создания JWT
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Dependency для верификации токена
security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("user_id")
        role: str = payload.get("role")
        if user_id is None or role is None:
            raise HTTPException(status_code=401, detail="Неверный токен")
        return {"user_id": user_id, "role": role}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Токен истёк")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Неверный токен")

@app.get("/api/users")
async def get_users(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Только для админа")
    cur.execute("SELECT id, username, role, created_at FROM users ORDER BY id")
    users = [
        {"id": r[0], "username": r[1], "role": r[2], "created_at": r[3]}
        for r in cur.fetchall()
    ]
    return {"users": users}

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
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
    password_hash = bcrypt.hash(password)
    created_at = datetime.utcnow().isoformat()
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
    if not row or not bcrypt.verify(password, row[2]):
        return JSONResponse({"error": "Неверный логин или пароль"}, status_code=401)
    user = {"id": row[0], "username": row[1], "role": row[3]}
    access_token = create_access_token({"user_id": user["id"], "role": user["role"]})
    return {"status": "ok", "user": user, "access_token": access_token}

# CORS (твой код)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Остальные эндпоинты (news, forum) без изменений, но если нужно защитить — добавь Depends(get_current_user)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)