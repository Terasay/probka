const API_URL = "http://79.174.78.128:8080";

// ==== Авторизация ====
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
    showAccount(data.user);
  } catch (err) {
    alert("Неверный логин или пароль");
  }
}

// ==== Регистрация ====
async function register() {
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;
  try {
    const res = await fetch(`${API_URL}/api/register`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({username, password})
    });
    if (!res.ok) throw new Error("Ошибка регистрации");
    alert("Регистрация успешна, теперь войдите");
  } catch (err) {
    alert("Ошибка: " + err.message);
  }
}

// ==== Отображение аккаунта ====
function showAccount(user) {
  document.getElementById("account-info").style.display = "block";
  document.getElementById("account-name").innerText = user.username;
  document.getElementById("account-role").innerText = user.role;

  // Скрываем или показываем админ-панель
  const adminPanel = document.getElementById("admin-panel");
  if (user.role === "admin") {
    adminPanel.style.display = "block";
    loadAllUsers(); // загрузим список пользователей
  } else {
    adminPanel.style.display = "none";
  }
}

// ==== Выход ====
function logout() {
  localStorage.removeItem("user");
  document.getElementById("account-info").style.display = "none";
  document.getElementById("admin-panel").style.display = "none";
}

// ==== Загрузка всех аккаунтов (только для админа) ====
async function loadAllUsers() {
  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
  if (savedUser.role !== "admin") return; // защита на клиенте

  try {
    const res = await fetch(`${API_URL}/api/admin/users`, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": savedUser.token || "" // на будущее
      }
    });
    if (!res.ok) throw new Error("Ошибка загрузки пользователей");
    const users = await res.json();

    const list = document.getElementById("users-list");
    list.innerHTML = "";
    users.forEach(u => {
      const li = document.createElement("li");
      li.textContent = `${u.username} (${u.role})`;
      list.appendChild(li);
    });
  } catch (err) {
    console.error("Ошибка:", err.message);
  }
}

// ==== Вешаем события ====
document.getElementById("login-btn").addEventListener("click", login);
document.getElementById("register-btn").addEventListener("click", register);
document.getElementById("logout-btn").addEventListener("click", logout);

// ==== Проверка при загрузке ====
const savedUser = localStorage.getItem("user");
if (savedUser) showAccount(JSON.parse(savedUser));
