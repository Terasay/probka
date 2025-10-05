const API_URL = "http://79.174.78.128:8080";
// Получить текущего пользователя (user должен быть определён глобально после логина)
function getCurrentUser() {
  if (window.user && window.user.username && window.user.id) {
    return window.user;
  }
  return null;
}
// Обработка создания новой темы
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('forum-create-form');
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const user = getCurrentUser();
      if (!user) return;
      const title = form.title.value.trim();
      if (!title) return;
      form.querySelector('button[type="submit"]').disabled = true;
      try {
        await fetch(`${API_URL}/api/forum/topics/create`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            title,
            author: user.username,
            author_id: user.id,
            avatar: '',
            date: new Date().toISOString()
          })
        });
        form.reset();
        await loadTopics();
      } catch (err) {
        alert('Ошибка создания темы');
        console.error(err);
      }
      form.querySelector('button[type="submit"]').disabled = false;
    });
  }
});
let currentTopic = null;

async function loadTopics() {
  const section = document.getElementById("forum-topics");
  // Не трогать форму создания темы
  const form = document.getElementById('forum-create-form');
  let html = '';
  if (form) html += form.outerHTML;
  html += '<div class="about-text">Загрузка тем...</div>';
  section.innerHTML = html;
  try {
    const res = await fetch(`${API_URL}/api/forum/topics`);
    const data = await res.json();
    const topics = Array.isArray(data) ? data : (data.topics || data);
    if (!topics.length) {
      section.innerHTML = (form ? form.outerHTML : '') + '<div class="about-text">Нет тем на форуме.</div>';
      return;
    }
    section.innerHTML = (form ? form.outerHTML : '') + topics.map(t => `
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
    document.querySelectorAll('.forum-topic').forEach(card => {
      card.addEventListener('click', () => openTopic(card.dataset.id, card.dataset.title));
    });
  } catch(err) {
    section.innerHTML = (form ? form.outerHTML : '') + '<div class="about-text">Ошибка загрузки тем :(</div>';
    console.error(err);
  }
}

function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function backToTopics() {
  document.getElementById("forum-messages").style.display = "none";
  document.getElementById("forum-topics").style.display = "flex";
}

document.getElementById("back-to-topics").addEventListener("click", backToTopics);

async function sendReply() {
  const user = getCurrentUser();
  if (!user) return;
  const text = document.getElementById("reply-text").value.trim();
  if (!text) return;
  document.getElementById("send-reply").disabled = true;
  try {
    await fetch(`${API_URL}/api/forum/topic/${currentTopic}/reply`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        content: text,
        author: user.username,
        author_id: user.id,
        avatar: ''
      })
    });
    document.getElementById("reply-text").value = "";
    await openTopic(currentTopic, document.getElementById("topic-title").innerText);
  } catch(err) {
    alert("Ошибка отправки сообщения");
    console.error(err);
  }
  document.getElementById("send-reply").disabled = false;
}


// Блокировать форму ответа для гостей
function updateReplyFormState() {
  const user = getCurrentUser();
  const textarea = document.getElementById("reply-text");
  const btn = document.getElementById("send-reply");
  if (!textarea || !btn) return;
  if (user) {
    textarea.disabled = false;
    btn.disabled = false;
    textarea.placeholder = "Ваш ответ...";
  } else {
    textarea.disabled = true;
    btn.disabled = true;
    textarea.placeholder = "Войдите, чтобы отвечать";
  }
}

document.getElementById("send-reply").addEventListener("click", sendReply);
document.addEventListener('DOMContentLoaded', updateReplyFormState);
window.addEventListener('user-session-changed', updateReplyFormState);

loadTopics();
