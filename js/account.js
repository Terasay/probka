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
    if (!res.ok) throw new Error("Ошибка регистрации");
    alert("Регистрация успешна, теперь войдите");
  } catch (err) {
    alert("Ошибка: " + err.message);
  }
}

function showAccount(user) {
  document.getElementById("account-info").style.display = "block";
  document.getElementById("account-name").innerText = user.username;
  document.getElementById("account-role").innerText = user.role;
}

function logout() {
  localStorage.removeItem("user");
  document.getElementById("account-info").style.display = "none";
}

document.getElementById("login-btn").addEventListener("click", login);
document.getElementById("register-btn").addEventListener("click", register);
document.getElementById("logout-btn").addEventListener("click", logout);

// Проверка при загрузке
const savedUser = localStorage.getItem("user");
if (savedUser) showAccount(JSON.parse(savedUser));
