// js/account.js
const API_URL = "";

document.addEventListener("DOMContentLoaded", () => {
  // Инициализация window.user из localStorage
  let savedUser = null;
  try {
    savedUser = localStorage.getItem("user");
    if (savedUser) {
      window.user = JSON.parse(savedUser);
    } else {
      window.user = null;
    }
  } catch (e) {
    window.user = null;
    localStorage.removeItem("user");
  }
  updateUI(window.user);

  // Настройки профиля: смена пароля
  const changePassForm = document.getElementById("change-pass-form");
  if (changePassForm) {
    changePassForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await changePassword();
    });
  }
  // Настройки профиля: загрузка аватарки
  const avatarInput = document.getElementById("avatar-upload-input");
  if (avatarInput) {
    avatarInput.addEventListener("change", handleAvatarUpload);
  }
});
async function changePassword() {
  const oldPass = document.getElementById("old-password").value.trim();
  const newPass = document.getElementById("new-password").value.trim();
  if (!oldPass || !newPass) {
    alert("Введите старый и новый пароль");
    return;
  }
  if (!window.user || !window.user.id) {
    alert("Неизвестный пользователь");
    return;
  }
  try {
    const resp = await apiFetch("/api/account/change_password", {
      method: "POST",
      body: JSON.stringify({
        user_id: window.user.id,
        old_password: oldPass,
        new_password: newPass
      })
    });
    alert("Пароль успешно изменён");
    document.getElementById("old-password").value = "";
    document.getElementById("new-password").value = "";
  } catch (err) {
    alert(err.message);
  }
}

async function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!window.user || !window.user.id) {
    alert("Неизвестный пользователь");
    return;
  }
  const formData = new FormData();
  formData.append("user_id", window.user.id);
  formData.append("file", file);
  try {
    const res = await fetch("/api/account/upload_avatar", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Ошибка загрузки");
    // Обновить аватарку в UI и в user
    if (window.user) {
      window.user.avatar = data.avatar;
      localStorage.setItem("user", JSON.stringify(window.user));
      updateUI(window.user);
    }
    document.getElementById("avatar-upload-input").value = "";
    alert("Аватарка обновлена!");
  } catch (err) {
    alert(err.message);
  }
}

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
      updateUI(window.user);
      console.log("[login] ok user:", window.user);
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
  async function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    // Всегда пробуем актуализировать window.user из localStorage
    try {
      const savedUser = localStorage.getItem("user");
      if (savedUser) window.user = JSON.parse(savedUser);
    } catch {}
    if (!window.user || !window.user.id) {
      alert("Неизвестный пользователь");
      return;
    }
    const formData = new FormData();
    formData.append("user_id", window.user.id);
    formData.append("file", file);
    try {
      const res = await fetch("/api/account/upload_avatar", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Ошибка загрузки");
      // Обновить аватарку в UI и в user
      if (window.user) {
        window.user.avatar = data.avatar;
        localStorage.setItem("user", JSON.stringify(window.user));
        updateUI(window.user);
      }
      document.getElementById("avatar-upload-input").value = "";
      alert("Аватарка обновлена!");
    } catch (err) {
      alert(err.message);
    }
  }
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
  const avatarImg = document.getElementById("account-avatar-img");
  const settingsBlock = document.getElementById("account-settings");

  if (user) {
    if (authForms) authForms.style.display = "none";
    if (accountInfo) accountInfo.style.display = "block";
    if (settingsBlock) settingsBlock.style.display = "block";
    const nameEl = document.getElementById("account-name");
    const roleEl = document.getElementById("account-role");
    if (nameEl) nameEl.innerText = user.username;
    if (roleEl) roleEl.innerText = user.role;
    if (navBtn) navBtn.innerText = user.username;
    if (avatarImg) {
      if (user.avatar) {
        avatarImg.src = user.avatar;
        avatarImg.style.display = "inline-block";
      } else {
        avatarImg.src = "assets/img/kakoedelo.jpeg";
        avatarImg.style.display = "inline-block";
      }
    }
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
    if (settingsBlock) settingsBlock.style.display = "none";
    if (adminPanel) adminPanel.style.display = "none";
    if (navBtn) navBtn.innerText = "Аккаунт";
    if (avatarImg) avatarImg.style.display = "none";
  }
}

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
