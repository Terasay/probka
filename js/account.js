const API_URL = "http://79.174.78.128:8080";

// ===== Вход =====
async function login() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();
  console.log("[login] trying", { username });
  if (!username || !password) { alert("Введите логин и пароль"); return; }

  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      credentials: "include"  // Включаем cookies
    });

    console.log("[login] response status:", res.status, "ok:", res.ok);

    const text = await res.text();
    console.log("[login] raw response text:", text);

    let data = null;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("[login] response is not json:", e);
      throw new Error("Ошибка сервера: невалидный JSON");
    }

    if (!res.ok) {
      const msg = (data.error || data.detail || `Ошибка входа (${res.status})`);
      throw new Error(msg);
    }

    localStorage.setItem("user", JSON.stringify(data.user));
    console.log("[login] logged in, user:", data.user);
    showAccount(data.user);
  } catch (err) {
    alert(err.message);
    console.error("[login] error:", err);
  }
}

// ===== Регистрация ===== (без изменений)

// ===== Отображение аккаунта ===== (без изменений)

// ===== Выход =====
async function logout() {
  try {
    await fetch(`${API_URL}/api/logout`, {
      method: "POST",
      credentials: "include"
    });
  } catch (e) {}
  localStorage.removeItem("user");
  document.getElementById("account-info").style.display = "none";
  document.getElementById("admin-panel").style.display = "none";
  const navBtn = document.querySelector('.nav-link.account-link');
  if (navBtn) navBtn.innerText = "Аккаунт";
}

// ===== Загрузка списка пользователей =====
async function loadUsers() {
  const tableBody = document.querySelector("#users-table tbody");
  tableBody.innerHTML = '<tr><td colspan="5">Загрузка...</td></tr>';
  try {
    const res = await fetch(`${API_URL}/api/users`, {
      credentials: "include"  // Отправляем cookies
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

    const data = await res.json();
    const users = Array.isArray(data) ? data : (data.users || []);
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

async function deleteUser(id) {
  try {
    const res = await fetch(`${API_URL}/api/users/${id}`, {
      method: "DELETE",
      credentials: "include"
    });
    console.log("[deleteUser] status:", res.status);
    if (res.status === 401) {
      alert("Сессия истекла, войдите снова");
      logout();
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: "Unknown" }));
      throw new Error("Ошибка удаления: " + (data.detail || res.status));
    }
    await loadUsers();
  } catch (err) {
    alert(err.message);
    console.error("[deleteUser] error:", err);
  }
}

// ===== Привязка кнопок =====
document.getElementById("login-btn").addEventListener("click", login);
document.getElementById("register-btn").addEventListener("click", register);
document.getElementById("logout-btn").addEventListener("click", logout);

// ===== Проверка сохранённого входа =====
const savedUser = localStorage.getItem("user");
if (savedUser) {
  try {
    const user = JSON.parse(savedUser);
    showAccount(user);
    console.log("[init] found saved user");
  } catch(e) {
    localStorage.removeItem("user");
  }
}