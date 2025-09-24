import sqlite3
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os


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

conn.commit()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
