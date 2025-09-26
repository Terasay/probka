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
}

// ===== Загрузка списка пользователей (только админ) =====
async function loadUsers() {
  const token = localStorage.getItem("token");
  if (!token) return;

  try {
    const res = await fetch(`${API_URL}/api/users`, {
      headers: { "Authorization": "Bearer " + token }
    });

    if (!res.ok) throw new Error("Нет доступа");

    const users = await res.json();
    const container = document.getElementById("users-list");
    container.innerHTML = "";

    users.forEach(u => {
      const div = document.createElement("div");
      div.textContent = `${u.username} (${u.role})`;
      container.appendChild(div);
    });
  } catch (err) {
    console.warn("Ошибка загрузки пользователей:", err.message);
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
