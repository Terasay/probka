// js/account.js
const API_URL = "";

const COUNTRIES = [
  { id: "hom", name: "Хомасия" },
  { id: "bgg", name: "Бурград" },
  { id: "myr", name: "Миртания" },
  { id: "tdv", name: "Трудовия" },
  { id: "ktv", name: "Крастовия" }
];

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

  function populateCountrySelect() {
    const select = document.getElementById("country-select");
    if (!select) return;
    select.innerHTML = "";
    COUNTRIES.forEach(c => {
      if (!takenCountries[c.id]) {
        const option = document.createElement("option");
        option.value = c.id;
        option.textContent = c.name;
        select.appendChild(option);
      }
    });
  }

  // Получить заявки и отрендерить при загрузке и при изменении пользователя
  async function updateCountryRequests() {
    await fetchCountryRequests();
    await fetchTakenCountries();
    renderCountryRequests();
    populateCountrySelect();
  }
  updateCountryRequests();
  window.addEventListener('user-session-changed', updateCountryRequests);

// --- Механика стран ---
// Список стран (можно вынести на сервер)

  // Список занятых стран (запрашивается с сервера)
  let takenCountries = {}; // id: taken_by

  async function fetchTakenCountries() {
    try {
      const res = await fetch("/api/countries/taken");
      if (res.ok) {
        const data = await res.json();
        takenCountries = Object.fromEntries(data);
      }
    } catch (e) { takenCountries = {}; }
  }

  // Показывать кнопку регистрации страны только если пользователь залогинен и не имеет страны
  function updateCountryButtonState() {
    const registerCountryBtn = document.getElementById("register-country-btn");
    if (!registerCountryBtn) return;
    if (!window.user || (window.user.country && takenCountries[window.user.country] == window.user.id)) {
      registerCountryBtn.style.display = "none";
    } else {
      registerCountryBtn.style.display = "block";
    }
  }

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

  // При изменении пользователя обновлять кнопку
  window.addEventListener('user-session-changed', updateCountryButtonState);

  // Навешивание обработчиков событий на кнопки (после каждого updateUI)
  function attachButtonHandlers() {
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
    // Форма смены пароля
    const changePassForm = document.getElementById("change-pass-form");
    if (changePassForm) {
      changePassForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await changePassword();
      });
    }
    // Загрузка аватарки
    const avatarInput = document.getElementById("avatar-upload-input");
    if (avatarInput) {
      avatarInput.addEventListener("change", handleAvatarUpload);
    }
    // Регистрация страны
    const registerCountryBtn = document.getElementById("register-country-btn");
    if (registerCountryBtn) {
      registerCountryBtn.addEventListener("click", () => {
        const modal = document.getElementById("country-modal");
        if (modal) modal.style.display = "block";
      });
    }
    // Закрытие модального окна
    const closeModalBtn = document.getElementById("close-country-modal");
    if (closeModalBtn) {
      closeModalBtn.addEventListener("click", () => {
        const modal = document.getElementById("country-modal");
        if (modal) modal.style.display = "none";
      });
    }
    // Форма регистрации страны
    const countryForm = document.getElementById("country-form");
    if (countryForm) {
      countryForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const playerName = document.getElementById("country-player-name").value.trim();
        const countryId = document.getElementById("country-select").value;
        if (!playerName || !countryId) {
          document.getElementById("country-form-status").textContent = "Заполните все поля";
          return;
        }
        try {
          const res = await fetch("/api/countries/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerName, countryId })
          });
          const data = await res.json();
          if (data.success) {
            document.getElementById("country-form-status").textContent = "Заявка отправлена!";
            document.getElementById("country-modal").style.display = "none";
            await updateCountryRequests(); // обновить список
          } else {
            document.getElementById("country-form-status").textContent = data.error;
          }
        } catch (err) {
          document.getElementById("country-form-status").textContent = "Ошибка: " + err.message;
        }
      });
    }
  }
  window.attachButtonHandlers = attachButtonHandlers;
  // Гарантированно навешиваем обработчики при загрузке страницы
  attachButtonHandlers();
}); // <-- закрываем document.addEventListener

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
  const registerCountryBtn = document.getElementById("register-country-btn");
  const countryInfoEl = document.getElementById("account-country-info");

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
    // Отображение страны
    if (countryInfoEl) {
      if (user.country && takenCountries[user.country] == user.id) {
        const countryObj = COUNTRIES.find(c => c.id === user.country);
        countryInfoEl.textContent = countryObj ? countryObj.name : user.country;
        countryInfoEl.style.display = "inline";
      } else {
        countryInfoEl.textContent = "-";
        countryInfoEl.style.display = "inline";
      }
    }
    // Панель админа показывать всегда для admin
    if (user.role === "admin") {
      if (adminPanel) {
        adminPanel.style.display = "block";
        loadUsers();
      }
    } else {
      if (adminPanel) adminPanel.style.display = "none";
    }
    // Кнопку регистрации страны показывать только если нет страны и не admin
    if (registerCountryBtn) {
      if (!user.country && user.role !== "admin") {
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
    if (countryInfoEl) countryInfoEl.style.display = "none";
  }
  // Всегда навешивать обработчики после обновления DOM
  if (typeof window.attachButtonHandlers === "function") {
    window.attachButtonHandlers();
  }
}

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
