document.addEventListener('DOMContentLoaded', async function() {
  let token = null;
  try {
    const raw = localStorage.getItem("user");
    if (raw) {
      const user = JSON.parse(raw);
      if (user && user.token) token = user.token;
    }
  } catch (e) {}
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let usersData = null;
  let activityData = null;
  try {
    const res = await fetch("/api/users", { method: "GET", headers });
    if (res.status === 200) {
      const data = await res.json();
      usersData = data.users || [];
      document.getElementById("admin-content").style.display = "block";
      document.getElementById("admin-error").style.display = "none";
      document.getElementById("admin-content").innerHTML = "<p>Добро пожаловать, админ! Здесь будет функционал панели.</p>";
    } else if (res.status === 403 || res.status === 401) {
      window.location.href = "403.html";
      return;
    } else {
      throw new Error("Forbidden");
    }
  } catch (err) {
    window.location.href = "403.html";
    return;
  }

  // Кнопка раскрытия списка пользователей
  const toggleBtn = document.getElementById("toggle-users");
  const usersPanel = document.getElementById("users-panel");
  let expanded = false;
  toggleBtn.addEventListener("click", function() {
    expanded = !expanded;
    if (expanded) {
      toggleBtn.textContent = "Скрыть пользователей";
      usersPanel.style.display = "block";
      usersPanel.innerHTML = renderUsersTable(usersData);
    } else {
      toggleBtn.textContent = "Показать пользователей";
      usersPanel.style.display = "none";
    }
  });

  // Кнопка раскрытия активности
  const toggleActivityBtn = document.getElementById("toggle-activity");
  const activityPanel = document.getElementById("activity-panel");
  let activityExpanded = false;
  toggleActivityBtn.addEventListener("click", async function() {
    activityExpanded = !activityExpanded;
    if (activityExpanded) {
      toggleActivityBtn.textContent = "Скрыть активность";
      activityPanel.style.display = "block";
      if (!activityData) {
        try {
          const res = await fetch("/api/users/activity", { method: "GET", headers });
          if (res.status === 200) {
            const data = await res.json();
            activityData = data.users || [];
          } else {
            activityPanel.innerHTML = '<div style="color:#b00;font-size:17px;">Ошибка загрузки активности</div>';
            return;
          }
        } catch(e) {
          activityPanel.innerHTML = '<div style="color:#b00;font-size:17px;">Ошибка сети</div>';
          return;
        }
      }
      activityPanel.innerHTML = renderActivityTable(activityData);
    } else {
      toggleActivityBtn.textContent = "Показать активность";
      activityPanel.style.display = "none";
    }
  });
});

function renderActivityTable(users) {
  if (!users || !users.length) return '<div style="color:#888;font-size:17px;">Нет данных</div>';
  let html = '<table style="width:100%;border-collapse:collapse;background:#181818;color:#fff;font-size:16px;box-shadow:0 2px 12px #0003;">';
  html += '<thead><tr style="background:#222;color:#39FF14;font-size:17px;">';
  html += '<th style="padding:8px 12px;border-bottom:1px solid #333;">ID</th>';
  html += '<th style="padding:8px 12px;border-bottom:1px solid #333;">Логин</th>';
  html += '<th style="padding:8px 12px;border-bottom:1px solid #333;">Последнее сообщение</th>';
  html += '<th style="padding:8px 12px;border-bottom:1px solid #333;">Вход в мессенджер</th>';
  html += '</tr></thead><tbody>';
  for (const u of users) {
    html += `<tr>`;
    html += `<td style='padding:7px 12px;border-bottom:1px solid #222;'>${u.id}</td>`;
    html += `<td style='padding:7px 12px;border-bottom:1px solid #222;'>${u.username}</td>`;
    html += `<td style='padding:7px 12px;border-bottom:1px solid #222;'>${u.last_message_at ? formatDate(u.last_message_at) : '-'}</td>`;
    html += `<td style='padding:7px 12px;border-bottom:1px solid #222;'>${u.last_messenger_visit ? formatDate(u.last_messenger_visit) : '-'}</td>`;
    html += `</tr>`;
  }
  html += '</tbody></table>';
  return html;
}

function formatDate(dt) {
  if (!dt) return '-';
  try {
    const d = new Date(dt);
    return d.toLocaleString('ru-RU');
  } catch(e) { return dt; }
}

function renderUsersTable(users) {
  if (!users || !users.length) return '<div style="color:#888;font-size:17px;">Нет пользователей</div>';
  let html = '<table style="width:100%;border-collapse:collapse;background:#181818;color:#fff;font-size:16px;box-shadow:0 2px 12px #0003;">';
  html += '<thead><tr style="background:#222;color:#39FF14;font-size:17px;">';
  html += '<th style="padding:8px 12px;border-bottom:1px solid #333;">ID</th>';
  html += '<th style="padding:8px 12px;border-bottom:1px solid #333;">Логин</th>';
  html += '<th style="padding:8px 12px;border-bottom:1px solid #333;">Роль</th>';
  html += '<th style="padding:8px 12px;border-bottom:1px solid #333;">Страна</th>';
  html += '<th style="padding:8px 12px;border-bottom:1px solid #333;">Дата регистрации</th>';
  html += '<th style="padding:8px 12px;border-bottom:1px solid #333;">Действия</th>';
  html += '</tr></thead><tbody>';
  for (const u of users) {
    html += `<tr>`;
    html += `<td style='padding:7px 12px;border-bottom:1px solid #222;'>${u.id}</td>`;
    html += `<td style='padding:7px 12px;border-bottom:1px solid #222;'>${u.username}</td>`;
    html += `<td style='padding:7px 12px;border-bottom:1px solid #222;'>${u.role}</td>`;
    html += `<td style='padding:7px 12px;border-bottom:1px solid #222;'>${u.country || '-'}</td>`;
    html += `<td style='padding:7px 12px;border-bottom:1px solid #222;'>${u.created_at ? new Date(u.created_at).toLocaleString('ru-RU') : '-'}</td>`;
    html += `<td style='padding:7px 12px;border-bottom:1px solid #222;'>`;
    html += `<button class='btn-remove-country' data-id='${u.id}' style='margin-right:8px;padding:4px 10px;font-size:15px;background:#333;color:#39FF14;border:none;border-radius:6px;cursor:pointer;'>Удалить страну</button>`;
    html += `<button class='btn-remove-user' data-id='${u.id}' style='padding:4px 10px;font-size:15px;background:#b00;color:#fff;border:none;border-radius:6px;cursor:pointer;'>Удалить аккаунт</button>`;
    html += `</td>`;
    html += `</tr>`;
  }
  html += '</tbody></table>';
  setTimeout(() => attachUserActions(), 0);
  return html;
}

function attachUserActions() {
  document.querySelectorAll('.btn-remove-country').forEach(btn => {
    btn.onclick = async function() {
      const userId = btn.getAttribute('data-id');
      if (!confirm('Удалить страну у пользователя?')) return;
      try {
        const res = await fetch(`/api/users/${userId}/reset_country`, { method: 'POST' });
        if (res.ok) {
          btn.closest('tr').querySelector('td:nth-child(4)').textContent = '-';
          alert('Страна удалена!');
        } else {
          alert('Ошибка при удалении страны');
        }
      } catch(e) { alert('Ошибка сети'); }
    };
  });
  document.querySelectorAll('.btn-remove-user').forEach(btn => {
    btn.onclick = async function() {
      const userId = btn.getAttribute('data-id');
      if (!confirm('Удалить аккаунт пользователя?')) return;
      try {
        const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
        if (res.ok) {
          btn.closest('tr').remove();
          alert('Аккаунт удалён!');
        } else {
          alert('Ошибка при удалении аккаунта');
        }
      } catch(e) { alert('Ошибка сети'); }
    };
  });
}
