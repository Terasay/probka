const API_URL = "http://79.174.78.128:8080";

// ===== Вход =====
async function login() {
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;

  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) throw new Error("Ошибка входа");

    const data = await res.json();

    // сохраняем пользователя и токен
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("token", data.token);

    showAccount(data.user);
  } catch (err) {
    alert("Неверный логин или пароль");
  }
}

// ===== Регистрация =====
async function register() {
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;

  try {
    const res = await fetch(`${API_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) throw new Error("Ошибка регистрации");
    alert("Регистрация успешна, теперь войдите");
  } catch (err) {
    alert("Ошибка: " + err.message);
  }
}

// ===== Отображение аккаунта =====
function showAccount(user) {
  document.getElementById("account-info").style.display = "block";
  document.getElementById("account-name").innerText = user.username;
  document.getElementById("account-role").innerText = user.role;

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
  if (!token) return;

  const table = document.getElementById("users-table").querySelector("tbody");
  table.innerHTML = '<tr><td colspan="5">Загрузка...</td></tr>';

  try {
    const res = await fetch(`${API_URL}/api/users`, {
      headers: { "Authorization": "Bearer " + token }
    });

    if (!res.ok) throw new Error("Нет доступа");

    const data = await res.json(); // {"users": [...]}

    table.innerHTML = (data.users || []).map(u => `
      <tr>
        <td>${u.id}</td>
        <td>${u.username}</td>
        <td>${u.role}</td>
        <td>${u.created_at ? new Date(u.created_at).toLocaleString() : ''}</td>
        <td>${u.role !== 'admin' ? `<button class="delete-user-btn" data-id="${u.id}">Удалить</button>` : ''}</td>
      </tr>
    `).join("");

    // Навесить обработчики на кнопки удаления
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Удалить пользователя?')) {
          await deleteUser(btn.dataset.id);
        }
      });
    });
  } catch (err) {
    console.warn("Ошибка загрузки пользователей:", err.message);
    table.innerHTML = '<tr><td colspan="5">Ошибка :(</td></tr>';
  }
}

// ===== Удаление пользователя =====
async function deleteUser(id) {
  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const res = await fetch(`${API_URL}/api/users/${id}`, {
      method: "DELETE",
      headers: { "Authorization": "Bearer " + token }
    });

    if (!res.ok) throw new Error("Ошибка удаления");
    await loadUsers();
  } catch (err) {
    alert("Ошибка удаления пользователя");
  }
}

// ===== Привязка кнопок =====
document.getElementById("login-btn").addEventListener("click", login);
document.getElementById("register-btn").addEventListener("click", register);
document.getElementById("logout-btn").addEventListener("click", logout);

// ===== Проверка сохранённого входа =====
const savedUser = localStorage.getItem("user");
if (savedUser) {
  showAccount(JSON.parse(savedUser));
}
