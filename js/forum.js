const API_URL = "http://localhost:8000";
let currentTopic = null;

// Загрузка тем форума
async function loadTopics() {
  const section = document.getElementById("forum-topics");
  section.innerHTML = '<div class="about-text">Загрузка тем...</div>';
  try {
    const res = await fetch(`${API_URL}/api/forum/topics`);
    const topics = await res.json();
    if (!topics.length) {
      section.innerHTML = '<div class="about-text">Нет тем на форуме.</div>';
      return;
    }
    section.innerHTML = topics.map(t => `
      <article class="news-card forum-topic" data-id="${t.id}" data-title="${t.title}">
        <div class="news-date">${new Date(t.date).toLocaleString()}</div>
        <div class="news-title">${t.title}</div>
        <div class="news-footer">
          <div class="footer-center">
            ${t.avatar ? `<img class="author-avatar" src="${t.avatar}" alt="аватар">` : ''}
          </div>
          <div class="footer-right">${t.author}</div>
        </div>
      </article>
    `).join("");
    // Навешиваем обработчики
    document.querySelectorAll('.forum-topic').forEach(card => {
      card.addEventListener('click', () => openTopic(card.dataset.id, card.dataset.title));
    });
  } catch(err) {
    section.innerHTML = '<div class="about-text">Ошибка загрузки тем :(</div>';
    console.error(err);
  }
}

// Экранирование HTML для защиты от XSS
function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Открытие темы и загрузка сообщений
async function openTopic(id, title) {
  currentTopic = id;
  document.getElementById("forum-topics").style.display = "none";
  document.getElementById("forum-messages").style.display = "flex";
  document.getElementById("topic-title").innerText = title;
  const list = document.getElementById("message-list");
  list.innerHTML = '<div class="about-text">Загрузка сообщений...</div>';
  try {
    const res = await fetch(`${API_URL}/api/forum/topic/${id}`);
    const msgs = await res.json();
    if (!msgs.length) {
      list.innerHTML = '<div class="about-text">Нет сообщений.</div>';
      return;
    }
    list.innerHTML = msgs.map(m => `
      <article class="news-card forum-message">
        <div class="news-date">${new Date(m.date).toLocaleString()}</div>
        <div class="news-content">${escapeHTML(m.content).replace(/\n/g, '<br>')}</div>
        <div class="news-footer">
          <div class="footer-center">
            ${m.avatar ? `<img class="author-avatar" src="${m.avatar}" alt="аватар">` : ''}
          </div>
          <div class="footer-right">${m.author}</div>
        </div>
      </article>
    `).join("");
  } catch(err) {
    list.innerHTML = '<div class="about-text">Ошибка загрузки сообщений :(</div>';
    console.error(err);
  }
}

// Назад к списку тем
function backToTopics() {
  document.getElementById("forum-messages").style.display = "none";
  document.getElementById("forum-topics").style.display = "flex";
}

document.getElementById("back-to-topics").addEventListener("click", backToTopics);

// Отправка ответа
async function sendReply() {
  const text = document.getElementById("reply-text").value.trim();
  if (!text) return;
  document.getElementById("send-reply").disabled = true;
  try {
    await fetch(`${API_URL}/api/forum/reply/${currentTopic}`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({content:text})
    });
    document.getElementById("reply-text").value = "";
    await openTopic(currentTopic, document.getElementById("topic-title").innerText);
  } catch(err) {
    alert("Ошибка отправки сообщения");
    console.error(err);
  }
  document.getElementById("send-reply").disabled = false;
}

document.getElementById("send-reply").addEventListener("click", sendReply);

// Инициализация
loadTopics();
