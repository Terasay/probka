const API_URL = ""; // пусто => работаем через nginx (тот же домен)

// ===== Универсальный запрос к API =====
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Сервер вернул невалидный JSON (status ${res.status})`);
  }

  if (!res.ok) {
    throw new Error(data.error || data.detail || `Ошибка (${res.status})`);
  }
  return data;
}

// ===== Вход =====
async function login() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!username || !password) return alert("Введите логин и пароль");

  try {
    const data = await apiFetch("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    localStorage.setItem("user", JSON.stringify(data.user));
    updateUI(data.user);
  } catch (err) {
    alert(err.message);
    console.error("[login]", err);
  }
}

// ===== Выход =====
async function logout() {
  try {
    await apiFetch("/api/logout", { method: "POST" });
  } catch {}
  localStorage.removeItem("user");
  updateUI(null);
}

// ===== Загрузка списка пользователей =====
async function loadUsers() {
  const tableBody = document.querySelector("#users-table tbody");
  tableBody.innerHTML = '<tr><td colspan="5">Загрузка...</td></tr>';
  try {
    const res = await fetch(`${API_URL}/api/users`, {
      credentials: "include"
    });
    console.log("[loadUsers] status:", res.status);

    if (res.status === 401) {
      alert("Сессия истекла, войдите снова");
      logout();
      return;
    }
    if (res.status === 403) {
      document.getElementById("admin-panel").style.display = "none";
      throw new Error("Нет доступа");
    }
    if (!res.ok) throw new Error(`Ошибка (${res.status})`);

    const users = await res.json();  // тут сразу массив
    console.log("[loadUsers] got users:", users);

    if (!users.length) {
      tableBody.innerHTML = '<tr><td colspan="5">Пользователей нет</td></tr>';
      return;
    }

    tableBody.innerHTML = users.map(u => `
      <tr>
        <td>${u.id}</td>
        <td>${u.username}</td>
        <td>${u.role}</td>
        <td>${u.created_at ? new Date(u.created_at).toLocaleString() : ''}</td>
        <td>${u.role !== 'admin' ? `<button class="delete-user-btn" data-id="${u.id}">Удалить</button>` : ''}</td>
      </tr>
    `).join("");

    // навесить обработчики кнопок
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить пользователя?')) return;
        await deleteUser(btn.dataset.id);
      });
    });

  } catch (err) {
    console.error("[loadUsers] error:", err);
    tableBody.innerHTML = '<tr><td colspan="5">Ошибка загрузки :( ' + err.message + '</td></tr>';
  }
}

// ===== События =====
document.getElementById("login-btn").addEventListener("click", login);

// ===== Автовход =====
const savedUser = localStorage.getItem("user");
if (savedUser) {
  try {
    updateUI(JSON.parse(savedUser));
  } catch {
    localStorage.removeItem("user");
  }
}
