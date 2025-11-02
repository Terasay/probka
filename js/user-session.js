// user-session.js
// Глобальная поддержка window.user и синхронизация с localStorage

(function() {
  function syncUserFromStorage() {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const user = JSON.parse(raw);
        if (user && user.id && user.username && user.role) {
          window.user = user;
          updateNavUser(user);
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

  // Синхронизация при загрузке
  syncUserFromStorage();

  // Следить за изменениями localStorage (другие вкладки)
  window.addEventListener('storage', function(e) {
    if (e.key === 'user') syncUserFromStorage();
  });

  // Для других скриптов
  window.getCurrentUser = function() {
    return window.user || null;
  };

  // Для account.js: обновлять window.user при логине/логауте
  window.setUserSession = function(user) {
    if (user && user.id && user.username && user.role) {
      localStorage.setItem('user', JSON.stringify(user));
      window.user = user;
    } else {
      localStorage.removeItem('user');
      window.user = null;
    }
    syncUserFromStorage();
  };
})();
