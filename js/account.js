// js/account.js
const API_URL = "";

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("login-btn").addEventListener("click", login);
  document.getElementById("logout-btn").addEventListener("click", logout);
  document.getElementById("register-btn").addEventListener("click", registerHandler);

  const savedUser = localStorage.getItem("user");
  if (savedUser) {
    try {
      updateUI(JSON.parse(savedUser));
    } catch (e) {
      localStorage.removeItem("user");
    }
  }
});

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(`Сервер вернул невалидный JSON (status ${res.status})`);
  }

  if (!res.ok) {
    throw new Error(data?.error || data?.detail || `Ошибка (${res.status})`);
  }

  return data;
}

async function login() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!username || !password) {
    alert("Введите логин и пароль");
    return;
  }

  try {
    const data = await apiFetch("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    if (data && data.user) {
      if (window.setUserSession) {
        window.setUserSession(data.user);
      } else {
        localStorage.setItem("user", JSON.stringify(data.user));
        window.user = data.user;
      }
      updateUI(data.user);
      console.log("[login] ok user:", data.user);
    } else {
      throw new Error("Неправильный ответ сервера при логине");
    }
  } catch (err) {
    alert(err.message);
    console.error("[login] error:", err);
  }
}

async function registerHandler() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!username || !password) {
    alert("Введите логин и пароль");
    return;
  }

  try {
    const data = await apiFetch("/api/register", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    if (data && data.status === "ok") {
      alert("Регистрация успешна — теперь можно войти");
      document.getElementById("login-password").value = "";
    } else {
      throw new Error("Регистрация не удалась");
    }
  } catch (err) {
    alert(err.message);
    console.error("[register] error:", err);
  }
}

async function logout() {
  try {
    if (window.setUserSession) {
      window.setUserSession(null);
    } else {
      localStorage.removeItem("user");
      window.user = null;
    }
    try {
      await apiFetch("/api/logout", { method: "POST" });
    } catch (e) {
      console.warn("[logout] server logout failed:", e.message);
    }
  } finally {
    updateUI(null);
  }
}

async function loadUsers() {
  const tableBody = document.querySelector("#users-table tbody");
  if (!tableBody) return;

  tableBody.innerHTML = '<tr><td colspan="5">Загрузка...</td></tr>';

  try {
    const data = await apiFetch("/api/users", { method: "GET" });

    const users = Array.isArray(data.users) ? data.users : [];

    console.log("[loadUsers] got users:", users);

    if (!users.length) {
      tableBody.innerHTML = '<tr><td colspan="5">Пользователей нет</td></tr>';
      return;
    }

    tableBody.innerHTML = users.map(u => `
      <tr>
        <td>${escapeHtml(String(u.id))}</td>
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.role)}</td>
        <td>${u.created_at ? escapeHtml(new Date(u.created_at).toLocaleString()) : ''}</td>
        <td>${u.role !== 'admin' ? `<button class="delete-user-btn" data-id="${u.id}">Удалить</button>` : ''}</td>
      </tr>
    `).join("");

    document.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm(`Удалить пользователя #${id}?`)) return;
        try {
          const resp = await apiFetch(`/api/users/${id}`, { method: "DELETE" });
          if (resp && resp.status === "ok") {
            await loadUsers();
          } else {
            throw new Error("Не удалось удалить пользователя");
          }
        } catch (err) {
          alert(err.message);
          console.error("[deleteUser]", err);
        }
      });
    });

  } catch (err) {
    console.error("[loadUsers] error:", err);
    tableBody.innerHTML = '<tr><td colspan="5">Ошибка загрузки: ' + escapeHtml(err.message) + '</td></tr>';
  }
}

// ===== UI обновление =====
function updateUI(user) {
  const authForms = document.getElementById("auth-forms");
  const accountInfo = document.getElementById("account-info");
  const adminPanel = document.getElementById("admin-panel");
  const navBtn = document.querySelector(".nav-link.account-link");

  if (user) {
    if (authForms) authForms.style.display = "none";
    if (accountInfo) accountInfo.style.display = "block";
    const nameEl = document.getElementById("account-name");
    const roleEl = document.getElementById("account-role");
    if (nameEl) nameEl.innerText = user.username;
    if (roleEl) roleEl.innerText = user.role;
    if (navBtn) navBtn.innerText = user.username;
    if (user.role === "admin") {
      if (adminPanel) {
        adminPanel.style.display = "block";
        loadUsers();
      }
    } else {
      if (adminPanel) adminPanel.style.display = "none";
    }
  } else {
    if (authForms) authForms.style.display = "block";
    if (accountInfo) accountInfo.style.display = "none";
    if (adminPanel) adminPanel.style.display = "none";
    if (navBtn) navBtn.innerText = "Аккаунт";
  }
}

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
