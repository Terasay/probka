const API_URL = "";

let takenCountries = {}; // id: taken_by

const COUNTRIES = [
  { id: "hom", name: "Хомасия" },
  { id: "bgg", name: "Бурград" },
  { id: "myr", name: "Миртания" },
  { id: "tdv", name: "Трудовия" },
  { id: "ktv", name: "Крастовия" }
];

document.addEventListener("DOMContentLoaded", () => {
  // --- Панель своей заявки на страну ---
  async function fetchMyCountryRequest() {
    if (!window.user) return null;
    const userId = window.user.id;
    try {
      const res = await fetch(`/api/countries/my_request?user_id=${userId}`);
      const data = await res.json();
      return data.request || null;
    } catch (e) {
      return null;
    }
  }

  function renderMyCountryRequestPanel(req) {
    const panel = document.getElementById("my-country-request-panel");
    const content = document.getElementById("my-country-request-content");
    if (!panel || !content) return;
    if (!window.user || window.user.role === "admin") {
      panel.style.display = "none";
      return;
    }
    if (!req) {
      panel.style.display = "none";
      content.innerHTML = "";
      return;
    }
    panel.style.display = "block";
    let countryName = getCountryName(req.country_id);
    let created = req.created_at ? new Date(req.created_at).toLocaleString() : "";
    content.innerHTML = `
      <div style="margin-bottom:8px;">Страна: <b>${escapeHtml(countryName)}</b></div>
      <div style="margin-bottom:8px;">Статус: <b>${escapeHtml(req.status)}</b></div>
      <div style="margin-bottom:8px;">Создана: <b>${escapeHtml(created)}</b></div>
      ${req.status === 'pending' ? `
        <div style="margin-bottom:8px;">
          <label>Изменить страну: </label>
          <select id="edit-country-select"></select>
          <button id="edit-country-btn">Изменить</button>
        </div>
        <button id="delete-country-request-btn" style="color:#b00;">Удалить заявку</button>
      ` : ''}
    `;
    if (req.status === 'pending') {
      // Заполнить select странами
      const select = document.getElementById("edit-country-select");
      if (select) {
        const countriesList = window.countriesList || COUNTRIES;
        select.innerHTML = "";
        countriesList.forEach(c => {
          // Страны, которые не заняты и не имеют других pending заявок
          if (c.taken_by !== null && c.taken_by !== undefined && c.taken_by !== '' && c.taken_by !== 0) return;
          // Исключить текущую страну заявки
          if (String(c.id) === String(req.country_id)) return;
          // Исключить страны с другими активными заявками
          const hasActiveRequest = (window.countryRequests || []).some(r => String(r.country) === String(c.id));
          if (hasActiveRequest) return;
          const option = document.createElement("option");
          option.value = c.id;
          option.textContent = c.name;
          select.appendChild(option);
        });
      }
      // Кнопка изменить
      const editBtn = document.getElementById("edit-country-btn");
      if (editBtn && select) {
        editBtn.onclick = async () => {
          const newCountryId = select.value;
          if (!newCountryId) return alert("Выберите страну");
          editBtn.disabled = true;
          try {
            const res = await fetch("/api/countries/edit_request", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: req.id, country_id: newCountryId, user_id: window.user.id })
            });
            const data = await res.json();
            if (data.success) {
              alert("Заявка обновлена");
              await updateMyCountryRequestPanel();
              await updateCountryRequests();
            } else {
              alert(data.error || "Ошибка обновления");
            }
          } catch (e) {
            alert(e.message || "Ошибка");
          } finally {
            editBtn.disabled = false;
          }
        };
      }
      // Кнопка удалить
      const delBtn = document.getElementById("delete-country-request-btn");
      if (delBtn) {
        delBtn.onclick = async () => {
          if (!confirm("Удалить заявку?")) return;
          delBtn.disabled = true;
          try {
            const res = await fetch("/api/countries/delete_request", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: req.id, user_id: window.user.id })
            });
            const data = await res.json();
            if (data.success) {
              alert("Заявка удалена");
              await updateMyCountryRequestPanel();
              await updateCountryRequests();
            } else {
              alert(data.error || "Ошибка удаления");
            }
          } catch (e) {
            alert(e.message || "Ошибка");
          } finally {
            delBtn.disabled = false;
          }
        };
      }
    }
  }

  async function updateMyCountryRequestPanel() {
    const req = await fetchMyCountryRequest();
    renderMyCountryRequestPanel(req);
  }

  window.addEventListener('user-session-changed', updateMyCountryRequestPanel);
  window.addEventListener('country-requests-updated', updateMyCountryRequestPanel);
  // После логина/регистрации/отправки заявки обновлять панель
  setTimeout(updateMyCountryRequestPanel, 500);
  async function fetchTakenCountries() {
    try {
      const res = await fetch("/api/countries/taken");
      if (res.ok) {
        const data = await res.json();
        // data: [[id, taken_by], ...]
        takenCountries = {};
        data.forEach(([id, taken_by]) => {
          if (taken_by) takenCountries[id] = taken_by;
        });
        console.log("[takenCountries]", takenCountries);
      } else {
        takenCountries = {};
        console.log("[takenCountries] пусто");
      }
    } catch (e) {
      takenCountries = {};
      console.log("[takenCountries] ошибка", e);
    }
  }
  const countryRequestsList = document.getElementById("country-requests-list");

  let countryRequests = [];

  async function fetchCountryRequests() {
    try {
      const res = await fetch("/api/countries/requests");
      if (res.ok) {
        countryRequests = await res.json();
        window.countryRequests = countryRequests;
      } else {
        countryRequests = [];
        window.countryRequests = [];
      }
    } catch (e) {
      countryRequests = [];
      window.countryRequests = [];
    }
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
    attachCountryRequestHandlers();
  }

  function attachCountryRequestHandlers() {
    document.querySelectorAll('[data-action="approve"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        try {
          const res = await fetch('/api/countries/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
          });
          const data = await res.json();
          if (data.success) {
            await updateCountryRequests();
          } else {
            alert(data.error || 'Ошибка одобрения');
          }
        } catch (err) {
          alert(err.message || 'Ошибка');
        } finally {
          btn.disabled = false;
        }
      });
    });
    document.querySelectorAll('[data-action="reject"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        try {
          const res = await fetch('/api/countries/reject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
          });
          const data = await res.json();
          if (data.success) {
            await updateCountryRequests();
          } else {
            alert(data.error || 'Ошибка отклонения');
          }
        } catch (err) {
          alert(err.message || 'Ошибка');
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  function getCountryName(id) {
    const c = COUNTRIES.find(c => c.id === id);
    return c ? c.name : id;
  }

  function populateCountrySelect() {
    const select = document.getElementById("country-select");
    if (!select) return;
    select.innerHTML = "";
    const countriesList = window.countriesList || COUNTRIES;
    console.log("[populateCountrySelect] countriesList:", countriesList);
    countriesList.forEach(c => {
      const countryId = String(c.id);
      // Если страна занята (taken_by не null/undefined/0/''), пропускаем
      if (c.taken_by !== null && c.taken_by !== undefined && c.taken_by !== '' && c.taken_by !== 0) return;
      // Если есть активная заявка на страну, тоже пропускаем
      const hasActiveRequest = (window.countryRequests || []).some(r => String(r.country) === countryId);
      if (hasActiveRequest) return;
      const option = document.createElement("option");
      option.value = countryId;
      option.textContent = c.name;
      select.appendChild(option);
    });
  }

  async function fetchCountriesList() {
    try {
      const res = await fetch("/api/countries/list");
      if (res.ok) {
        const data = await res.json();
        // data: [{id, name, taken_by}]
        window.countriesList = Array.isArray(data)
          ? data.map(c => ({ id: c.id, name: c.name, taken_by: c.taken_by }))
          : COUNTRIES;
      } else {
        window.countriesList = COUNTRIES;
      }
    } catch (e) {
      window.countriesList = COUNTRIES;
    }
  }

  async function updateCountryRequests() {
    await fetchCountryRequests();
    await fetchCountriesList();
    await fetchTakenCountries();
    renderCountryRequests();
    await fetchTakenCountries();
    populateCountrySelect();
    window.dispatchEvent(new Event('country-requests-updated'));
  }
  updateCountryRequests();
  window.addEventListener('user-session-changed', updateCountryRequests);
  function updateCountryButtonState() {
    const registerCountryBtn = document.getElementById("register-country-btn");
    if (!registerCountryBtn) return;
    if (!window.user || (window.user.country && takenCountries[window.user.country] == window.user.id)) {
      registerCountryBtn.style.display = "none";
    } else {
      registerCountryBtn.style.display = "block";
    }
  }

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

      const myCountryPanel = document.getElementById("my-country-request-panel");
  updateUI(window.user);

  window.addEventListener('user-session-changed', updateCountryButtonState);

  function attachButtonHandlers() {
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        await logout();
      });
    }
    const loginBtn = document.getElementById("login-btn");
    if (loginBtn) {
      loginBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        await login();
      });
    }
    const registerBtn = document.getElementById("register-btn");
    if (registerBtn) {
      registerBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        await registerHandler();
        if (myCountryPanel) myCountryPanel.style.display = "";
      });
    }
    const registerCountryBtn = document.getElementById("register-country-btn");
    if (registerCountryBtn) {
      registerCountryBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const modal = document.getElementById("country-modal");
        if (modal) {
          modal.classList.add("active");
        if (myCountryPanel) myCountryPanel.style.display = "none";
        }
      });
    }
    const closeCountryModalBtn = document.getElementById("close-country-modal");
    if (closeCountryModalBtn) {
      closeCountryModalBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const modal = document.getElementById("country-modal");
        if (modal) {
          modal.classList.remove("active");
        }
      });
    }
    const changePassForm = document.getElementById("change-pass-form");
    if (changePassForm) {
      changePassForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        await changePassword();
      });
    }
    const avatarInput = document.getElementById("avatar-upload-input");
    if (avatarInput) {
      avatarInput.addEventListener("change", handleAvatarUpload);
    }
  }
  window.attachButtonHandlers = attachButtonHandlers;
  attachButtonHandlers();

    const countryForm = document.getElementById("country-form");
    if (countryForm) {
      countryForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const playerNameInput = document.getElementById("country-player-name");
        const countrySelect = document.getElementById("country-select");
        const statusDiv = document.getElementById("country-form-status");
        if (!playerNameInput || !countrySelect) return;
        const playerName = playerNameInput.value.trim();
        const countryId = countrySelect.value;
        if (!playerName || !countryId) {
          statusDiv.textContent = "Заполните все поля";
          statusDiv.style.color = "red";
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
            statusDiv.textContent = "Заявка отправлена!";
            statusDiv.style.color = "green";
            playerNameInput.value = "";
            countrySelect.value = "";
            // Обновить заявки и список стран
            await updateCountryRequests();
          } else {
            statusDiv.textContent = data.error || "Ошибка отправки заявки";
            statusDiv.style.color = "red";
          }
        } catch (err) {
          statusDiv.textContent = err.message || "Ошибка отправки";
          statusDiv.style.color = "red";
        }
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
  let token = null;
  try {
    const raw = localStorage.getItem("user");
    if (raw) {
      const user = JSON.parse(raw);
      if (user && user.token) token = user.token;
    }
  } catch (e) {}

  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers,
    ...options
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(`Сервер вернул невалидный JSON (status ${res.status})`);
  }

  if (!res.ok) {
    // Если токен отозван или 401 — сбрасываем пользователя
    if (res.status === 401 || (data?.error && String(data.error).includes("Токен отозван"))) {
      // Очищаем localStorage и window.user
      localStorage.removeItem("user");
      window.user = null;
      window.dispatchEvent(new Event('user-session-changed'));
      updateUI(null);
      throw new Error("Токен отозван, требуется повторный вход");
      // return; // Не выполнять дальнейший код
    }
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

    if (data && data.user && data.token) {
      const userWithToken = { ...data.user, token: data.token };
      // Очищаем localStorage перед записью нового токена
      localStorage.removeItem("user");
      if (window.setUserSession) {
        window.setUserSession(userWithToken);
      } else {
        localStorage.setItem("user", JSON.stringify(userWithToken));
        window.user = userWithToken;
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

    if (data && data.status === "ok" && data.user && data.token) {
      // После регистрации сразу логиним
      const userWithToken = { ...data.user, token: data.token };
      // Очищаем localStorage перед записью нового токена
      localStorage.removeItem("user");
      if (window.setUserSession) {
        window.setUserSession(userWithToken);
      } else {
        localStorage.setItem("user", JSON.stringify(userWithToken));
        window.user = userWithToken;
      }
      updateUI(window.user);
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
    // Сначала отправляем запрос на сервер с токеном
    try {
      await apiFetch("/api/logout", { method: "POST" });
    } catch (e) {
      console.warn("[logout] server logout failed:", e.message);
    }
    // После успешного/неуспешного запроса сбрасываем user
    if (window.setUserSession) {
      window.setUserSession(null);
    } else {
      localStorage.removeItem("user");
      window.user = null;
      window.dispatchEvent(new Event('user-session-changed'));
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
        <td>
          ${u.role !== 'admin' ? `<button class="delete-user-btn" data-id="${u.id}">Удалить</button>` : ''}
          ${u.role !== 'admin' && u.country ? `<button class="reset-country-btn" data-id="${u.id}">Сбросить страну</button>` : ''}
        </td>
      </tr>
    `).join("");

    document.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm(`Удалить пользователя #${id}?`)) return;
        btn.disabled = true;
        try {
          const resp = await apiFetch(`/api/users/${id}`, { method: "DELETE" });
          if (resp && resp.status === "ok") {
            alert("Пользователь удалён");
            await loadUsers();
          } else {
            alert(resp.error || "Не удалось удалить пользователя");
          }
        } catch (err) {
          alert(err.message);
          console.error("[deleteUser]", err);
        } finally {
          btn.disabled = false;
        }
      });
    });

    document.querySelectorAll('.reset-country-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm(`Сбросить страну у пользователя #${id}?`)) return;
        btn.disabled = true;
        try {
          const resp = await apiFetch(`/api/users/${id}/reset_country`, { method: "POST" });
          if (resp && resp.status === "ok") {
            alert("Страна сброшена");
            await loadUsers();
          } else {
            alert(resp.error || "Не удалось сбросить страну");
          }
        } catch (err) {
          alert(err.message);
          console.error("[resetCountry]", err);
        } finally {
          btn.disabled = false;
        }
      });
    });

  } catch (err) {
    console.error("[loadUsers] error:", err);
    tableBody.innerHTML = '<tr><td colspan="5">Ошибка загрузки: ' + escapeHtml(err.message) + '</td></tr>';
  }
}

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
    if (countryInfoEl) {
      if (user.country) {
        const countryObj = COUNTRIES.find(c => c.id === user.country);
        countryInfoEl.textContent = countryObj ? countryObj.name : user.country;
        countryInfoEl.style.display = "inline";
      } else {
        countryInfoEl.textContent = "-";
        countryInfoEl.style.display = "inline";
      }
    }
    if (user.role === "admin") {
      if (adminPanel) {
        adminPanel.style.display = "block";
        // Только если user валиден, вызываем loadUsers
        if (user && user.token) {
          loadUsers();
        }
      }
    } else {
      if (adminPanel) adminPanel.style.display = "none";
    }
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
