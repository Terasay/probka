// js/account.js
const API_URL = "";

document.addEventListener("DOMContentLoaded", () => {
  // --- Админ: заявки на регистрацию страны ---
  const countryRequestsList = document.getElementById("country-requests-list");

  // Заявки на регистрацию страны (запрашиваются с сервера)
  let countryRequests = [];

  async function fetchCountryRequests() {
    try {
      const res = await fetch("/api/countries/requests");
      if (res.ok) {
        countryRequests = await res.json();
      }
    } catch (e) { countryRequests = []; }
  }

  function renderCountryRequests() {
    if (!countryRequestsList) return;
    if (!window.user || window.user.role !== "admin") {
      countryRequestsList.innerHTML = "";
      return;
    }
    if (!countryRequests.length) {
      countryRequestsList.innerHTML = "Нет заявок.";
      return;
    }
    countryRequestsList.innerHTML = countryRequests.map(req =>
      `<div class="country-request" style="border:1px solid #ccc; margin:8px 0; padding:8px; border-radius:6px;">
        <b>${escapeHtml(req.player)}</b> хочет зарегистрировать страну <b>${getCountryName(req.country)}</b>
        <button data-action="approve" data-id="${req.id}">Одобрить</button>
        <button data-action="reject" data-id="${req.id}">Отклонить</button>
      </div>`
    ).join("");
  }

  function getCountryName(id) {
    const c = COUNTRIES.find(c => c.id === id);
    return c ? c.name : id;
  }

  // Обработка кнопок одобрить/отклонить
  if (countryRequestsList) {
    countryRequestsList.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const id = parseInt(btn.dataset.id);
      const req = countryRequests.find(r => r.id === id);
      if (!req) return;
      if (btn.dataset.action === "approve") {
        // Одобрить заявку через API
        const res = await fetch(`/api/countries/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id })
        });
        if (res.ok) {
          alert(`Заявка одобрена: ${req.player} теперь ${getCountryName(req.country)}`);
          await updateCountryRequests();
        } else {
          alert("Ошибка одобрения заявки");
        }
      } else if (btn.dataset.action === "reject") {
        // Отклонить заявку через API
        const res = await fetch(`/api/countries/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id })
        });
        if (res.ok) {
          alert(`Заявка отклонена: ${req.player}`);
          await updateCountryRequests();
        } else {
          alert("Ошибка отклонения заявки");
        }
      }
    });
  }

  // Получить заявки и отрендерить при загрузке и при изменении пользователя
  async function updateCountryRequests() {
    await fetchCountryRequests();
    renderCountryRequests();
  }
  updateCountryRequests();
  window.addEventListener('user-session-changed', updateCountryRequests);
  // --- Механика стран ---
  const registerCountryBtn = document.getElementById("register-country-btn");
  const countryModal = document.getElementById("country-modal");
  const closeCountryModalBtn = document.getElementById("close-country-modal");
  const countryForm = document.getElementById("country-form");
  const countrySelect = document.getElementById("country-select");
  const countryFormStatus = document.getElementById("country-form-status");

  // Список стран (можно вынести на сервер)
  const COUNTRIES = [
    { id: "rus", name: "Россия" },
    { id: "usa", name: "США" },
    { id: "chn", name: "Китай" },
    { id: "jpn", name: "Япония" },
    { id: "deu", name: "Германия" }
  ];

  // Список занятых стран (запрашивается с сервера)
  let takenCountries = [];

  async function fetchTakenCountries() {
    try {
      const res = await fetch("/api/countries/taken");
      if (res.ok) {
        takenCountries = await res.json();
      }
    } catch (e) { takenCountries = []; }
  }

  // Показывать кнопку регистрации страны только если пользователь залогинен и не имеет страны
  function updateCountryButtonState() {
    if (!window.user || window.user.country) {
      registerCountryBtn.style.display = "none";
    } else {
      registerCountryBtn.style.display = "block";
    }
  }

  // Открыть модальное окно
  if (registerCountryBtn) {
    registerCountryBtn.addEventListener("click", () => {
      countryModal.style.display = "flex";
      countryFormStatus.textContent = "";
      fetchTakenCountries().then(() => {
        countrySelect.innerHTML = COUNTRIES.map(c =>
          `<option value="${c.id}" ${takenCountries.includes(c.id) ? "disabled" : ""}>${c.name}${takenCountries.includes(c.id) ? " (занято)" : ""}</option>`
        ).join("");
      });
    });
  }

  // Закрыть модальное окно
  if (closeCountryModalBtn) {
    closeCountryModalBtn.addEventListener("click", () => {
      countryModal.style.display = "none";
    });
  }

  // Отправка заявки на регистрацию страны
  if (countryForm) {
    countryForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const playerName = document.getElementById("country-player-name").value.trim();
      const countryId = countrySelect.value;
      if (!playerName || !countryId) {
        countryFormStatus.textContent = "Заполните все поля";
        return;
      }
      countryFormStatus.textContent = "Отправка заявки...";
      fetch("/api/countries/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName, countryId })
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            countryFormStatus.textContent = "Заявка отправлена! Ожидайте одобрения администратора.";
            setTimeout(() => { countryModal.style.display = "none"; }, 1000);
          } else {
            countryFormStatus.textContent = data.error || "Ошибка отправки заявки";
          }
        })
        .catch(() => {
          countryFormStatus.textContent = "Ошибка соединения с сервером";
        });
    });
  }

  updateCountryButtonState();

  // При изменении пользователя обновлять кнопку
  window.addEventListener('user-session-changed', updateCountryButtonState);
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

  // Кнопка выхода
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await logout();
    });
  }

  // Кнопка входа
  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) {
    loginBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await login();
    });
  }

  // Кнопка регистрации
  const registerBtn = document.getElementById("register-btn");
  if (registerBtn) {
    registerBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await registerHandler();
    });
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
      // Диспатчить событие для синхронизации между вкладками
      window.dispatchEvent(new Event('user-session-changed'));
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
    // Показывать кнопку регистрации страны только если нет страны
    if (registerCountryBtn) {
      if (!user.country) {
        registerCountryBtn.style.display = "block";
      } else {
        registerCountryBtn.style.display = "none";
      }
    }
  } else {
    if (authForms) authForms.style.display = "block";
    if (accountInfo) accountInfo.style.display = "none";
    if (settingsBlock) settingsBlock.style.display = "none";
    if (adminPanel) adminPanel.style.display = "none";
    if (navBtn) navBtn.innerText = "Аккаунт";
    if (avatarImg) avatarImg.style.display = "none";
    if (registerCountryBtn) registerCountryBtn.style.display = "none";
  }
}

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
