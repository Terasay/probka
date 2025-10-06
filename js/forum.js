const API_URL = "http://79.174.78.128:8080";

// Синхронизация window.user из localStorage (гарантированно до любого использования)
try {
  const savedUser = localStorage.getItem('user');
  if (savedUser) {
    window.user = JSON.parse(savedUser);
  } else {
    window.user = null;
  }
} catch (e) {
  window.user = null;
}
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
      if (typeof window.syncUserAndNavAndForm === 'function') window.syncUserAndNavAndForm();
      return;
    }
    section.innerHTML = (form ? form.outerHTML : '') + topics.map(t => `
      <article class="news-card forum-topic" data-id="${escapeHTML(t.id)}" data-title="${escapeHTML(t.title)}">
        <div class="forum-topic-header">
          <div class="forum-topic-avatar">
            ${t.avatar ? `<img class="author-avatar" src="${escapeHTML(t.avatar)}" alt="аватар">` : '<div class="author-avatar avatar-placeholder"></div>'}
          </div>
          <div class="forum-topic-meta">
            <div class="forum-topic-title">${escapeHTML(t.title)}</div>
            <div class="forum-topic-info">
              <span class="forum-topic-author">${escapeHTML(t.author)}</span>
              <span class="forum-topic-date">${new Date(t.date).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </article>
    `).join("");
    document.querySelectorAll('.forum-topic').forEach(card => {
      card.addEventListener('click', () => openTopic(card.dataset.id, card.dataset.title));
    });
    if (typeof window.syncUserAndNavAndForm === 'function') window.syncUserAndNavAndForm();
  } catch(err) {
    section.innerHTML = (form ? form.outerHTML : '') + '<div class="about-text">Ошибка загрузки тем :(</div>';
    if (typeof window.syncUserAndNavAndForm === 'function') window.syncUserAndNavAndForm();
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
    // Для каждого сообщения — контейнер для лайков
    list.innerHTML = msgs.map(m => `
      <article class="news-card forum-message" data-id="${escapeHTML(m.id)}">
        <div class="forum-message-header">
          <div class="forum-message-avatar">
            ${m.avatar ? `<img class="author-avatar" src="${escapeHTML(m.avatar)}" alt="аватар">` : '<div class="author-avatar avatar-placeholder"></div>'}
          </div>
          <div class="forum-message-meta">
            <span class="forum-message-author">${escapeHTML(m.author)}</span>
            <span class="forum-message-date">${new Date(m.date).toLocaleString()}</span>
          </div>
        </div>
        <div class="forum-message-content">${escapeHTML(m.content).replace(/\n/g, '<br>')}</div>
        <div class="forum-likes" id="forum-likes-${escapeHTML(m.id)}">
          <button class="forum-like-btn" data-value="1" data-id="${escapeHTML(m.id)}" title="Лайк">👍</button>
          <span class="forum-like-count" id="forum-like-count-${escapeHTML(m.id)}">0</span>
          <button class="forum-dislike-btn" data-value="-1" data-id="${escapeHTML(m.id)}" title="Дизлайк">👎</button>
          <span class="forum-dislike-count" id="forum-dislike-count-${escapeHTML(m.id)}">0</span>
        </div>
      </article>
    `).join("");
    // Загрузить лайки для каждого сообщения
    for (const m of msgs) {
      fetch(`${API_URL}/api/forum/message/${m.id}/likes`).then(r=>r.json()).then(likes => {
        document.getElementById(`forum-like-count-${m.id}`).textContent = likes.like || 0;
        document.getElementById(`forum-dislike-count-${m.id}`).textContent = likes.dislike || 0;
      });
    }
  } catch(err) {
    list.innerHTML = '<div class="about-text">Ошибка загрузки сообщений :(</div>';
    console.error(err);
  }
// Обработка кликов по лайкам/дизлайкам сообщений форума
document.addEventListener('click', async e => {
  if (e.target.classList.contains('forum-like-btn') || e.target.classList.contains('forum-dislike-btn')) {
    const user = getCurrentUser();
    if (!user) return alert('Войдите, чтобы голосовать');
    const msgId = e.target.getAttribute('data-id');
    const value = parseInt(e.target.getAttribute('data-value'));
    await fetch(`${API_URL}/api/forum/message/${msgId}/like`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({user_id: user.id, value})
    });
    // обновить счетчики
    const likes = await fetch(`${API_URL}/api/forum/message/${msgId}/likes`).then(r=>r.json());
    document.getElementById(`forum-like-count-${msgId}`).textContent = likes.like || 0;
    document.getElementById(`forum-dislike-count-${msgId}`).textContent = likes.dislike || 0;
  }
});
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
