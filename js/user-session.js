
window.user = null;
(function() {
  async function fetchUserFromCookie() {
    try {
      const res = await fetch("/api/account/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.user && data.user.id && data.user.username && data.user.role) {
          window.user = data.user;
          updateNavUser(window.user);
          window.dispatchEvent(new Event('user-session-changed'));
          return;
        }
      }
    } catch(e) {}
  window.user = null;
  updateNavUser(null);
  window.dispatchEvent(new Event('user-session-changed'));
  }

  function updateNavUser(user) {
    const navBtn = document.querySelector('.nav-link.account-link');
    if (navBtn) {
      navBtn.innerText = user ? user.username : 'Аккаунт';
    }
  }

  fetchUserFromCookie().then(() => {
    updateNavUser(window.user);
    window.dispatchEvent(new Event('user-session-changed'));
  });

  window.addEventListener('user-session-changed', function() {
    fetchUserFromCookie();
  });

  window.getCurrentUser = function() {
    return window.user || null;
  };
  window.setUserSession = function() {
    fetchUserFromCookie();
  };
})();
