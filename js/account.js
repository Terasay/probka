const API_URL = "http://79.174.78.128:8080";

// ===== Вход =====
async function login() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!username || !password) { alert("Введите логин и пароль"); return; }

  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(()=>null);
      throw new Error((err && err.error) ? err.error : "Ошибка входа");
    }
    const data = await res.json();
    // сохраняем пользователя и токен
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("token", data.token);
    showAccount(data.user);
  } catch (err) {
    alert("Неверный логин или пароль");
    console.error("login error:", err);
  }
}

// ===== Регистрация =====
async function register() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!username || !password) { alert("Введите логин и пароль"); return; }

  try {
    const res = await fetch(`${API_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(()=>null);
      throw new Error((err && err.error) ? err.error : "Ошибка регистрации");
    }
    alert("Регистрация успешна, теперь войдите");
  } catch (err) {
    alert("Ошибка: " + (err.message || err));
    console.error("register error:", err);
  }
}

// ===== Отображение аккаунта =====
function showAccount(user) {
  document.getElementById("account-info").style.display = "block";
  document.getElementById("account-name").innerText = user.username;
  document.getElementById("account-role").innerText = user.role;

  // обновим кнопку меню
  const navBtn = document.querySelector('.nav-link.account-link');
  if (navBtn) navBtn.innerText = user.username;

  // показываем панель только админу
  if (user.role === "admin") {
    document.getElementById("admin-panel").style.display = "block";
    loadUsers();
  } else {
    document.getElementById("admin-panel").style.display = "none";
  }
}

// ===== Выход =====
function logout() {
  localStorage.removeItem("user");
  localStorage.removeItem("token");
  document.getElementById("account-info").style.display = "none";
  document.getElementById("admin-panel").style.display = "none";
  const navBtn = document.querySelector('.nav-link.account-link');
  if (navBtn) navBtn.innerText = "Аккаунт";
}

// ===== Загрузка списка пользователей (только админ) =====
async function loadUsers() {
  const token = localStorage.getItem("token");
  const tableBody = document.querySelector("#users-table tbody");
  if (!token) {
    tableBody.innerHTML = '<tr><td colspan="5">Нет токена — войдите</td></tr>';
    return;
  }

  tableBody.innerHTML = '<tr><td colspan="5">Загрузка...</td></tr>';
  try {
    const res = await fetch(`${API_URL}/api/users`, {
      headers: { "Authorization": "Bearer " + token }
    });
    if (res.status === 401) {
      alert("Сессия истекла, войдите снова");
      logout();
      return;
    }
    if (!res.ok) throw new Error("Нет доступа");

    const data = await res.json();
    // сервер может вернуть массив (users) или объект { users: [...] }
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
    console.error("loadUsers error:", err);
    tableBody.innerHTML = '<tr><td colspan="5">Ошибка загрузки :(</td></tr>';
  }
}

async function deleteUser(id) {
  const token = localStorage.getItem("token");
  if (!token) { alert("Войдите как админ"); return; }
  try {
    const res = await fetch(`${API_URL}/api/users/${id}`, {
      method: "DELETE",
      headers: { "Authorization": "Bearer " + token }
    });
    if (!res.ok) throw new Error("Ошибка удаления");
    await loadUsers();
  } catch (err) {
    alert("Ошибка удаления пользователя");
    console.error("deleteUser error:", err);
  }
}

// ===== Привязка кнопок =====
document.getElementById("login-btn").addEventListener("click", login);
document.getElementById("register-btn").addEventListener("click", register);
document.getElementById("logout-btn").addEventListener("click", logout);

// ===== Проверка сохранённого входа =====
const savedUser = localStorage.getItem("user");
const savedToken = localStorage.getItem("token");
if (savedUser && savedToken) {
  try {
    const user = JSON.parse(savedUser);
    showAccount(user);
  } catch(e) {
    // сломанные данные — чистим
    localStorage.removeItem("user");
    localStorage.removeItem("token");
  }
}
