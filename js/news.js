async function loadNews() {
  const feed = document.getElementById('news-feed');
  try {
    const res = await fetch('http://localhost:8000/api/news');
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

      card.innerHTML = `
        ${title ? `<h2 class="news-title">${title}</h2>` : ''}
        <div class="news-content">${content.replace(/\n/g, '<br>')}</div>
        ${attachmentHTML}
        <div class="news-footer">
          <div class="footer-left">${new Date(item.date).toLocaleString()}</div>
          <div class="footer-center">
            ${item.avatar 
              ? `<img class="author-avatar" src="${item.avatar}" alt="аватар">` 
              : ''}
          </div>
          <div class="footer-right">${item.author}</div>
        </div>
      `;

      feed.appendChild(card);
    });

  } catch(err) {
    feed.innerHTML = '<p>Ошибка загрузки новостей :(</p>';
    console.error(err);
  }
}

loadNews();
