// user-session.js
// Глобальная поддержка window.user и синхронизация с localStorage

(function() {
  // Получить пользователя из куки через /api/account/me
  async function fetchUserFromCookie() {
    try {
      const res = await fetch("/api/account/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.user && data.user.id && data.user.username && data.user.role) {
          window.user = data.user;
          updateNavUser(window.user);
          return;
        }
      }
    } catch(e) {}
    window.user = null;
    updateNavUser(null);
  }

  function updateNavUser(user) {
    const navBtn = document.querySelector('.nav-link.account-link');
    if (navBtn) {
      navBtn.innerText = user ? user.username : 'Аккаунт';
    }
  }

  // Инициализация window.user при загрузке страницы
  fetchUserFromCookie();

  // Следить за изменениями куки (логин/логаут в других вкладках)
  window.addEventListener('user-session-changed', function() {
    fetchUserFromCookie();
  });

  // Для других скриптов
  window.getCurrentUser = function() {
    return window.user || null;
  };

  // Для account.js: обновлять window.user при логине/логауте
  // После логина/логаута всегда обновляем window.user из /api/account/me
  window.setUserSession = function() {
    fetchUserFromCookie();
  };
})();
