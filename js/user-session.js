// user-session.js
// Глобальная поддержка window.user без localStorage

(function() {
  function updateNavUser(user) {
    const navBtn = document.querySelector('.nav-link.account-link');
    if (navBtn) {
      navBtn.innerText = user ? user.username : 'Аккаунт';
    }
  }

  // Инициализация window.user как null при загрузке
  window.user = null;
  updateNavUser(null);

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
  };
})();
