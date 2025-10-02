const API_URL = "http://79.174.78.128:8080";

// Получить текущего пользователя (user должен быть определён глобально после логина)
function getCurrentUser() {
  if (window.user && window.user.username && window.user.id) {
    return { username: window.user.username, id: window.user.id };
  }
  return null;
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
                               <img src="uploads/${item.id}/${filename}" class="news-image">
                             </div>`;
        });
        content = content.replace(/\[Файл: .*?\]/g, '').trim();
      }

      // --- Новый дизайн карточки ---
      card.innerHTML = `
        <div class="news-header-row">
          <div class="news-title-block">
            ${title ? `<h2 class="news-title">${title}</h2>` : ''}
            <div class="news-meta">
              <span class="news-author">${item.author}</span>
              <span class="news-date">${new Date(item.date).toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div class="news-content">${content.replace(/\n/g, '<br>')}</div>
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
              <span class="comment-author">${c.author}</span>
              <span class="comment-date">${new Date(c.date).toLocaleString()}</span>
              <div class="comment-content">${c.content.replace(/\n/g, '<br>')}</div>
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
              <span class="comment-author">${c.author}</span>
              <span class="comment-date">${new Date(c.date).toLocaleString()}</span>
              <div class="comment-content">${c.content.replace(/\n/g, '<br>')}</div>
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

loadNews();
