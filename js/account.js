const API_URL = ""; // пусто => работаем через nginx (тот же домен)

// ===== Универсальный запрос к API =====
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Сервер вернул невалидный JSON (status ${res.status})`);
  }

  if (!res.ok) {
    throw new Error(data.error || data.detail || `Ошибка (${res.status})`);
  }
  return data;
}

// ===== Вход =====
async function login() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();
  if (!username || !password) return alert("Введите логин и пароль");

  try {
    const data = await apiFetch("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    localStorage.setItem("user", JSON.stringify(data.user));
    updateUI(data.user);
  } catch (err) {
    alert(err.message);
    console.error("[login]", err);
  }
}

// ===== Выход =====
async function logout() {
  try {
    await apiFetch("/api/logout", { method: "POST" });
  } catch {}
  localStorage.removeItem("user");
  updateUI(null);
}

// ===== Загрузка списка пользователей =====
async function loadUsers() {
  const tableBody = document.querySelector("#users-table tbody");
  tableBody.innerHTML = '<tr><td colspan="5">Загрузка...</td></tr>';

  try {
    const users = await apiFetch("/api/users");
    if (!users.length) {
      tableBody.innerHTML = '<tr><td colspan="5">Пользователей нет</td></tr>';
      return;
    }

    tableBody.innerHTML = users.map(u => `
      <tr>
        <td>${u.id}</td>
        <td>${u.username}</td>
        <td>${u.role}</td>
        <td>${u.created_at ? new Date(u.created_at).toLocaleString() : ''}</td>
        <td>${u.role !== 'admin' ? `<button class="delete-user-btn" data-id="${u.id}">Удалить</button>` : ''}</td>
      </tr>
    `).join("");

    tableBody.querySelectorAll(".delete-user-btn").forEach(btn =>
      btn.addEventListener("click", () => deleteUser(btn.dataset.id))
    );
  } catch (err) {
    console.error("[loadUsers]", err);
    tableBody.innerHTML = `<tr><td colspan="5">Ошибка: ${err.message}</td></tr>`;
  }
}

async function deleteUser(id) {
  if (!confirm("Удалить пользователя?")) return;
  try {
    await apiFetch(`/api/users/${id}`, { method: "DELETE" });
    await loadUsers();
  } catch (err) {
    alert(err.message);
  }
}

// ===== UI =====
function updateUI(user) {
  const accountInfo = document.getElementById("account-info");
  const adminPanel = document.getElementById("admin-panel");
  const navBtn = document.querySelector(".nav-link.account-link");

  if (user) {
    accountInfo.style.display = "block";
    accountInfo.innerHTML = `
      <p>Вы вошли как <b>${user.username}</b> (${user.role})</p>
      <button id="logout-btn">Выйти</button>
    `;
    navBtn && (navBtn.innerText = user.username);
    document.getElementById("logout-btn").addEventListener("click", logout);

    if (user.role === "admin") {
      adminPanel.style.display = "block";
      loadUsers();
    } else {
      adminPanel.style.display = "none";
    }
  } else {
    accountInfo.style.display = "none";
    adminPanel.style.display = "none";
    navBtn && (navBtn.innerText = "Аккаунт");
  }
}

// ===== События =====
document.getElementById("login-btn").addEventListener("click", login);

// ===== Автовход =====
const savedUser = localStorage.getItem("user");
if (savedUser) {
  try {
    updateUI(JSON.parse(savedUser));
  } catch {
    localStorage.removeItem("user");
  }
}
