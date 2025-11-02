const API_URL = "http://79.174.78.128:8080";

// Получить текущего пользователя (user должен быть определён глобально после логина)
function getCurrentUser() {
  if (window.user && window.user.username && window.user.id) {
    // Вернуть всю структуру user, чтобы был доступ к role
    return window.user;
  }
  return null;
}


// Функция для экранирования HTML
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadNews() {
  const feed = document.getElementById('news-feed');
  try {
    const res = await fetch(`${API_URL}/api/news`);
    const data = await res.json();
    feed.innerHTML = '';

    data.forEach(item => {
      const card = document.createElement('article');
      card.className = 'news-card';
      let title = '';
      let content = item.content;
      const lines = item.content.split('\n');
      if (lines[0].startsWith('***') && lines[0].endsWith('***')) {
        title = lines[0].replace(/\*\*\*/g, '').trim();
        content = lines.slice(1).join('\n').trim();
      }

      let attachmentHTML = '';
      const fileMatches = content.match(/\[Файл: (.*?)\]/g);
      if (fileMatches) {
        fileMatches.forEach(f => {
          const filename = f.match(/\[Файл: (.*?)\]/)[1];
          attachmentHTML += `<div class="news-attachment">
                               <img src="uploads/${item.id}/${escapeHTML(filename)}" class="news-image">
                             </div>`;
        });
        content = content.replace(/\[Файл: .*?\]/g, '').trim();
      }

      // --- Новый дизайн карточки ---
      card.innerHTML = `
        <div class="news-header-row">
          <div class="news-title-block">
            ${title ? `<h2 class="news-title">${escapeHTML(title)}</h2>` : ''}
            <div class="news-meta">
              <span class="news-author">${escapeHTML(item.author)}</span>
              <span class="news-date">${new Date(item.date).toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div class="news-content">${escapeHTML(content).replace(/\n/g, '<br>')}</div>
        ${attachmentHTML}
        <div class="news-actions-row">
          <div class="news-likes" id="likes-${item.id}">
            <button class="like-btn" data-value="1" data-id="${item.id}">👍</button>
            <span class="like-count" id="like-count-${item.id}">0</span>
            <button class="dislike-btn" data-value="-1" data-id="${item.id}">👎</button>
            <span class="dislike-count" id="dislike-count-${item.id}">0</span>
          </div>
        </div>
        <div class="news-comments-block">
          <div class="news-comments" id="comments-${item.id}"></div>
          <form class="comment-form" data-id="${item.id}">
            <input type="text" name="comment" placeholder="Оставьте комментарий..." required maxlength="500">
            <button type="submit">Отправить</button>
          </form>
        </div>
      `;

      feed.appendChild(card);

      // Загрузить лайки
      fetch(`${API_URL}/api/news/${item.id}/likes`).then(r=>r.json()).then(likes => {
        document.getElementById(`like-count-${item.id}`).textContent = likes.like || 0;
        document.getElementById(`dislike-count-${item.id}`).textContent = likes.dislike || 0;
      });

      // Загрузить комментарии
      fetch(`${API_URL}/api/news/${item.id}/comments`).then(r=>r.json()).then(comments => {
        const commentsDiv = document.getElementById(`comments-${item.id}`);
        if (comments.length === 0) {
          commentsDiv.innerHTML = '<div class="no-comments">Комментариев нет</div>';
        } else {
          commentsDiv.innerHTML = comments.map(c =>
            `<div class="comment-row">
              <span class="comment-author">${escapeHTML(c.author)}</span>
              <span class="comment-date">${new Date(c.date).toLocaleString()}</span>
              <div class="comment-content">${escapeHTML(c.content).replace(/\n/g, '<br>')}</div>
            </div>`
          ).join('');
        }
      });

      // Отключить форму комментария если не залогинен
      const user = getCurrentUser();
      if (!user) {
        const form = card.querySelector('.comment-form');
        form.querySelector('input[name="comment"]').disabled = true;
        form.querySelector('button[type="submit"]').disabled = true;
        form.querySelector('input[name="comment"]').placeholder = 'Войдите, чтобы комментировать';
      }
    });

    // Обработка лайков/дизлайков
    feed.addEventListener('click', async e => {
      if (e.target.classList.contains('like-btn') || e.target.classList.contains('dislike-btn')) {
        const user = getCurrentUser();
        if (!user) return alert('Войдите, чтобы голосовать');
        const newsId = e.target.getAttribute('data-id');
        const value = parseInt(e.target.getAttribute('data-value'));
        await fetch(`${API_URL}/api/news/${newsId}/like`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({user_id: user.id, value})
        });
        // обновить счетчики
        const likes = await fetch(`${API_URL}/api/news/${newsId}/likes`).then(r=>r.json());
        document.getElementById(`like-count-${newsId}`).textContent = likes.like || 0;
        document.getElementById(`dislike-count-${newsId}`).textContent = likes.dislike || 0;
      }
    });

    // Обработка отправки комментариев
    feed.addEventListener('submit', async e => {
      if (e.target.classList.contains('comment-form')) {
        e.preventDefault();
        const user = getCurrentUser();
        if (!user) return;
        const newsId = e.target.getAttribute('data-id');
        const input = e.target.querySelector('input[name="comment"]');
        const content = input.value.trim();
        if (!content) return;
        await fetch(`${API_URL}/api/news/${newsId}/comments/add`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({author: user.username, author_id: user.id, content})
        });
        input.value = '';
        // обновить комментарии
        const comments = await fetch(`${API_URL}/api/news/${newsId}/comments`).then(r=>r.json());
        const commentsDiv = document.getElementById(`comments-${newsId}`);
        if (comments.length === 0) {
          commentsDiv.innerHTML = '<div class="no-comments">Комментариев нет</div>';
        } else {
          commentsDiv.innerHTML = comments.map(c =>
            `<div class="comment-row">
              <span class="comment-author">${escapeHTML(c.author)}</span>
              <span class="comment-date">${new Date(c.date).toLocaleString()}</span>
              <div class="comment-content">${escapeHTML(c.content).replace(/\n/g, '<br>')}</div>
            </div>`
          ).join('');
        }
      }
    });

  } catch(err) {
    feed.innerHTML = '<p>Ошибка загрузки новостей :(</p>';
    console.error(err);
  }
}


// Показывать форму публикации только для админа
function showAdminPanelIfNeeded() {
  const user = getCurrentUser();
  const panel = document.getElementById('news-admin-panel');
  const btn = document.getElementById('show-news-create-btn');
  const form = document.getElementById('news-create-form');
  if (user && user.role === 'admin') {
    panel.style.display = '';
    if (btn && form) {
      // Сбросить состояние: форма скрыта, кнопка "Создать новость"
      form.style.display = 'none';
      btn.textContent = 'Создать новость';
    }
  } else {
    panel.style.display = 'none';
    if (btn && form) {
      form.style.display = 'none';
      btn.textContent = 'Создать новость';
    }
  }
}

// Обработка публикации новости
function setupNewsCreateForm() {
  const form = document.getElementById('news-create-form');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user || user.role !== 'admin') return;
    const title = form.title.value.trim();
    const content = form.content.value.trim();
    if (!content) return;
    // Формат: если есть заголовок, то ***Заголовок***\nТекст
    let fullContent = content;
    if (title) fullContent = `***${title}***\n${content}`;
    await fetch(`${API_URL}/api/news/create`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        author: user.username,
        author_id: user.id,
        content: fullContent,
        avatar: '',
        attachments: ''
      })
    });
    form.reset();
    loadNews();
  });
}

// Инициализация
// Инициализация только после получения пользователя
window.addEventListener('user-session-changed', () => {
  showAdminPanelIfNeeded();
  setupNewsCreateForm();
  loadNews();
});
