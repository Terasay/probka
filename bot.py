import discord
from discord.ext import commands
import sqlite3
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import aiohttp
import asyncio
from dotenv import load_dotenv
from aiohttp_socks import ProxyConnector

load_dotenv()

TOKEN = os.getenv("DISCORD_TOKEN")
PROXY_URL = os.getenv("PROXY_URL")  # например: socks5://127.0.0.1:9050

NEWS_CHANNEL_ID = 1215953926919163956
FORUM_CHANNEL_ID = 1419703714691944538

# --- База данных ---
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

# --- Discord бот ---
intents = discord.Intents.default()
intents.messages = True
intents.message_content = True
intents.guilds = True
intents.members = True

bot = commands.Bot(command_prefix="!", intents=intents)
session: aiohttp.ClientSession | None = None  # создаём позже


@bot.event
async def setup_hook():
    """Создание aiohttp-сессии с поддержкой прокси"""
    global session
    if PROXY_URL:
        connector = ProxyConnector.from_url(PROXY_URL)
        session = aiohttp.ClientSession(connector=connector)
        print(f"[+] Используется прокси: {PROXY_URL}")
    else:
        session = aiohttp.ClientSession()
        print("[+] Прокси не используется")


# ====== НОВОСТИ ======
async def process_news_message(message: discord.Message):
    if message.author.bot:
        return

    cur.execute("SELECT 1 FROM news WHERE id = ?", (str(message.id),))
    if cur.fetchone():
        return

    content = message.content
    if message.embeds:
        content += "\n".join(e.description for e in message.embeds if e.description)
    if message.attachments:
        content += "\n" + "\n".join(f"[Файл: {a.filename}]" for a in message.attachments)

    avatar_url = message.author.avatar.url if message.author.avatar else ""

    # скачивание вложений
    for attachment in message.attachments:
        folder = f"uploads/{message.id}"
        os.makedirs(folder, exist_ok=True)
        file_path = f"{folder}/{attachment.filename}"
        async with session.get(attachment.url) as resp:
            if resp.status == 200:
                with open(file_path, "wb") as f:
                    f.write(await resp.read())

    attachments = ",".join([f"{message.id}/{a.filename}" for a in message.attachments])

    cur.execute(
        "INSERT OR IGNORE INTO news VALUES (?,?,?,?,?,?,?)",
        (str(message.id), str(message.author), content, str(message.created_at),
         str(message.author.id), avatar_url, attachments)
    )
    conn.commit()


# ====== ФОРУМ ======
async def process_thread(thread: discord.Thread):
    owner = thread.owner or thread.guild.me
    avatar = owner.avatar.url if owner and owner.avatar else ""

    cur.execute(
        "INSERT OR IGNORE INTO forum_topics VALUES (?,?,?,?,?,?)",
        (str(thread.id), thread.name, str(owner), str(owner.id), avatar, str(thread.created_at))
    )
    conn.commit()

    async for message in thread.history(limit=50, oldest_first=True):
        await process_forum_message(message, thread.id)


async def process_forum_message(message: discord.Message, topic_id: int):
    if message.author.bot and message.author != bot.user:
        return

    avatar_url = message.author.avatar.url if message.author.avatar else ""
    attachments = ",".join([a.url for a in message.attachments])

    cur.execute(
        "INSERT OR IGNORE INTO forum_messages VALUES (?,?,?,?,?,?,?,?)",
        (str(message.id), str(topic_id), str(message.author),
         str(message.author.id), avatar_url, message.content,
         str(message.created_at), attachments)
    )
    conn.commit()


# ====== EVENTS ======
@bot.event
async def on_ready():
    print(f"Бот готов! Подключен как {bot.user}")

    # Новости
    channel = bot.get_channel(NEWS_CHANNEL_ID)
    if channel:
        async for message in channel.history(limit=10):
            await process_news_message(message)

    # Форум
    forum = bot.get_channel(FORUM_CHANNEL_ID)
    if forum and hasattr(forum, "threads"):
        for thread in forum.threads:
            await process_thread(thread)


@bot.event
async def on_message(message: discord.Message):
    if message.channel.id == NEWS_CHANNEL_ID:
        await process_news_message(message)

    if isinstance(message.channel, discord.Thread):
        await process_forum_message(message, message.channel.id)


# --- FastAPI ---
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
    conn = sqlite3.connect("site.db")
    cur = conn.cursor()
    cur.execute("SELECT * FROM news ORDER BY date DESC")
    rows = cur.fetchall()
    conn.close()
    return [
        {"id": r[0], "author": r[1], "content": r[2], "date": r[3],
         "author_id": r[4], "avatar": r[5], "attachments": r[6]}
        for r in rows
    ]


@app.get("/api/forum/topics")
def get_topics():
    cur.execute("SELECT * FROM forum_topics ORDER BY date DESC")
    rows = cur.fetchall()
    return [
        {"id": r[0], "title": r[1], "author": r[2], "author_id": r[3],
         "avatar": r[4], "date": r[5]}
        for r in rows
    ]


@app.get("/api/forum/topic/{topic_id}")
def get_messages(topic_id: str):
    cur.execute("SELECT * FROM forum_messages WHERE topic_id = ? ORDER BY date ASC", (topic_id,))
    rows = cur.fetchall()
    return [
        {"id": r[0], "topic_id": r[1], "author": r[2], "author_id": r[3],
         "avatar": r[4], "content": r[5], "date": r[6], "attachments": r[7]}
        for r in rows
    ]


@app.post("/api/forum/reply/{topic_id}")
async def reply(topic_id: str, request: Request):
    data = await request.json()
    content = data.get("content", "").strip()
    if not content:
        return {"status": "error", "message": "Пустое сообщение"}

    future = asyncio.run_coroutine_threadsafe(
        send_message_to_discord(topic_id, content),
        bot.loop
    )

    try:
        msg = future.result(timeout=10)
    except Exception as e:
        return {"status": "error", "message": str(e)}

    if msg:
        avatar_url = bot.user.avatar.url if bot.user.avatar else ""
        cur.execute(
            "INSERT OR IGNORE INTO forum_messages VALUES (?,?,?,?,?,?,?,?)",
            (str(msg.id), topic_id, str(bot.user), str(bot.user.id),
             avatar_url, content, str(msg.created_at), "")
        )
        conn.commit()
        return {"status": "ok"}

    return {"status": "error", "message": "Не удалось отправить"}


async def send_message_to_discord(topic_id: str, content: str):
    channel = bot.get_channel(int(topic_id))
    if channel and isinstance(channel, discord.Thread):
        return await channel.send(content)
    return None


# --- Общий запуск ---
async def main():
    config = uvicorn.Config(app, host="0.0.0.0", port=8080, loop="asyncio", lifespan="on")
    server = uvicorn.Server(config)

    api_task = asyncio.create_task(server.serve())
    bot_task = asyncio.create_task(bot.start(TOKEN))

    await asyncio.gather(api_task, bot_task)


if __name__ == "__main__":
    asyncio.run(main())
