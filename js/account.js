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

// ===== Удаление пользователя =====
async function deleteUser(id) {
  try {
    await apiFetch(`/api/users/${id}`, { method: "DELETE" });
    loadUsers();
  } catch (err) {
    alert(err.message);
    console.error("[deleteUser]", err);
  }
}

// ===== Загрузка списка пользователей =====
async function loadUsers() {
  const tableBody = document.querySelector("#users-table tbody");
  tableBody.innerHTML = '<tr><td colspan="5">Загрузка...</td></tr>';
  try {
    const res = await fetch(`${API_URL}/api/users`, { credentials: "include" });

    if (res.status === 401) {
      logout();
      return;
    }
    if (res.status === 403) {
      document.getElementById("admin-panel").style.display = "none";
      return;
    }
    if (!res.ok) throw new Error(`Ошибка (${res.status})`);

    const users = await res.json();

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

// ===== Обновление интерфейса =====
function updateUI(user) {
  const accountInfo = document.getElementById("account-info");
  const navBtn = document.querySelector(".nav-link.account-link");

  if (user) {
    // показываем инфу
    accountInfo.style.display = "block";
    document.getElementById("account-name").innerText = user.username;
    document.getElementById("account-role").innerText = user.role;
    if (navBtn) navBtn.innerText = user.username;

    document.getElementById("logout-btn").onclick = logout;

    // если админ — грузим пользователей
    if (user.role === "admin") {
      document.getElementById("admin-panel").style.display = "block";
      loadUsers();
    } else {
      document.getElementById("admin-panel").style.display = "none";
    }
  } else {
    // скрываем при выходе
    accountInfo.style.display = "none";
    document.getElementById("admin-panel").style.display = "none";
    if (navBtn) navBtn.innerText = "Аккаунт";
  }
}

// ===== События =====
document.getElementById("login-btn").addEventListener("click", login);
document.getElementById("register-btn").addEventListener("click", async () => {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!username || !password) return alert("Введите логин и пароль");

  try {
    const data = await apiFetch("/api/register", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    alert("Регистрация успешна!");
    localStorage.setItem("user", JSON.stringify(data.user));
    updateUI(data.user);
  } catch (err) {
    alert(err.message);
    console.error("[register]", err);
  }
});

// ===== Автовход =====
const savedUser = localStorage.getItem("user");
if (savedUser) {
  try {
    updateUI(JSON.parse(savedUser));
  } catch {
    localStorage.removeItem("user");
  }
}
