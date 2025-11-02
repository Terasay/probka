// user-session.js
// Глобальная поддержка window.user без localStorage

(function() {
  function updateNavUser(user) {
    const navBtn = document.querySelector('.nav-link.account-link');
    if (navBtn) {
      navBtn.innerText = user ? user.username : 'Аккаунт';
    }
  }


  // Инициализация window.user по cookie при загрузке
  async function initUserSession() {
    try {
      const res = await fetch("/api/account/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.user && data.user.id && data.user.username && data.user.role) {
          window.user = data.user;
        } else {
          window.user = null;
        }
      } else {
        window.user = null;
      }
    } catch (e) {
      window.user = null;
    }
    updateNavUser(window.user);
    window.dispatchEvent(new Event('user-session-changed'));
  }

  initUserSession();

  // Для других скриптов
  window.getCurrentUser = function() {
    return window.user || null;
  };

  // Для account.js: обновлять window.user при логине/логауте
  window.setUserSession = function(user) {
    if (user && user.id && user.username && user.role) {
      window.user = user;
    } else {
      window.user = null;
    }
    updateNavUser(window.user);
    window.dispatchEvent(new Event('user-session-changed'));
  };
})();
