document.addEventListener('DOMContentLoaded', async function() {
  let token = null;
  try {
    const raw = localStorage.getItem("user");
    if (raw) {
      const user = JSON.parse(raw);
      if (user && user.token) token = user.token;
    }
  } catch (e) {}
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const res = await fetch("/api/users", { method: "GET", headers });
    if (res.status === 200) {
      document.getElementById("admin-content").style.display = "block";
      document.getElementById("admin-error").style.display = "none";
      document.getElementById("admin-content").innerHTML = "<p>Добро пожаловать, админ! Здесь будет функционал панели.</p>";
    } else if (res.status === 403 || res.status === 401) {
      window.location.href = "403.html";
    } else {
      throw new Error("Forbidden");
    }
  } catch (err) {
    window.location.href = "403.html";
  }
});
