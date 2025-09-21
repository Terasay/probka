document.addEventListener("DOMContentLoaded", function () {
  const themeLink = document.getElementById("theme-link");

  function setTheme(theme) {
    if (!themeLink) return;
    themeLink.href = "css/theme-" + theme + ".css";
    localStorage.setItem("theme", theme);
  }

  const btnDark = document.getElementById("theme-dark");
  const btnLight = document.getElementById("theme-light");
  const btnGray = document.getElementById("theme-gray");
  const btnRed = document.getElementById("theme-red");
  const btnPink = document.getElementById("theme-pink");

  if (btnDark) btnDark.addEventListener("click", () => setTheme("dark"));
  if (btnLight) btnLight.addEventListener("click", () => setTheme("light"));
  if (btnGray) btnGray.addEventListener("click", () => setTheme("gray"));
  if (btnRed) btnRed.addEventListener("click", () => setTheme("red"));
  if (btnPink) btnPink.addEventListener("click", () => setTheme("pink"));
});
