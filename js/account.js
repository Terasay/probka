const API_URL = "http://79.174.78.128:8080";

async function login() {
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;
  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({username, password})
    });
    if (!res.ok) throw new Error("Ошибка входа");
    const data = await res.json();
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("access_token", data.access_token);
    showAccount(data.user);
  } catch (err) {
    alert("Неверный логин или пароль");
  }
}

async function register() {
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;
  try {
    const res = await fetch(`${API_URL}/api/register`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({username, password})
    });
    if (!res.ok) throw new Error(await res.json().error || "Ошибка регистрации");
    alert("Регистрация успешна, теперь войдите");
  } catch (err) {
    alert("Ошибка: " + err.message);
  }
}

function showAccount(user) {
  document.getElementById("account-info").style.display = "block";
  document.getElementById("account-name").innerText = user.username;
  document.getElementById("account-role").innerText = user.role;
  const navBtn = document.querySelector('.nav-link.account-link');
  if (navBtn) navBtn.innerText = user.username;
  // Показываем панель только если роль admin (для UX, но сервер защитит)
  if (user.role === "admin") {
    document.getElementById("admin-panel").style.display = "block";
    loadUsers();
  } else {
    document.getElementById("admin-panel").style.display = "none";
  }
}

async function loadUsers() {
  const token = localStorage.getItem("access_token");
  const table = document.getElementById("users-table").querySelector("tbody");
  table.innerHTML = '<tr><td colspan="5">Загрузка...</td></tr>';
  try {
    const res = await fetch(`${API_URL}/api/users`, {
      headers: {"Authorization": `Bearer ${token}`}
    });
    if (res.status === 403 || res.status === 401) {
      document.getElementById("admin-panel").style.display = "none";  // Скрываем если нет прав
      throw new Error("Нет доступа");
    }
    if (!res.ok) throw new Error("Ошибка загрузки пользователей");
    const data = await res.json();
    table.innerHTML = data.users.map(u => `
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
        if (confirm('Удалить пользователя?')) {
          await deleteUser(btn.dataset.id);
        }
      });
    });
  } catch (err) {
    table.innerHTML = '<tr><td colspan="5">Ошибка :(</td></tr>';
  }
}

async function deleteUser(id) {
  const token = localStorage.getItem("access_token");
  try {
    const res = await fetch(`${API_URL}/api/users/${id}`, {
      method: "DELETE",
      headers: {"Authorization": `Bearer ${token}`}
    });
    if (res.status === 403 || res.status === 401) throw new Error("Нет доступа");
    if (!res.ok) throw new Error("Ошибка удаления");
    await loadUsers();
  } catch (err) {
    alert("Ошибка удаления пользователя: " + err.message);
  }
}

function logout() {
  localStorage.removeItem("user");
  localStorage.removeItem("access_token");
  document.getElementById("account-info").style.display = "none";
  document.getElementById("admin-panel").style.display = "none";
  const navBtn = document.querySelector('.nav-link.account-link');
  if (navBtn) navBtn.innerText = "Аккаунт";
}

document.getElementById("login-btn").addEventListener("click", login);
document.getElementById("register-btn").addEventListener("click", register);
document.getElementById("logout-btn").addEventListener("click", logout);

// Проверка при загрузке
const savedUser = localStorage.getItem("user");
if (savedUser) showAccount(JSON.parse(savedUser));