document.addEventListener("DOMContentLoaded", function () {
  const themeLink = document.getElementById("theme-link");

  function setTheme(theme) {
    if (!themeLink) return;
    themeLink.href = "css/theme-" + theme + ".css";
    localStorage.setItem("theme", theme);
      // Удаляем все классы тем с body
      document.body.classList.remove(
        "theme-dark",
        "theme-pink",
        "theme-light",
        "theme-gray",
        "theme-red",
        "theme-cyberpank",
        "theme-deep-dark"
      );
      document.body.classList.add("theme-" + theme);
  }

  const btnDark = document.getElementById("theme-dark");
  const btnLight = document.getElementById("theme-light");
  const btnGray = document.getElementById("theme-gray");
  const btnRed = document.getElementById("theme-red");
  const btnPink = document.getElementById("theme-pink");
  const btnCyberpank = document.getElementById("theme-cyberpank");
  const btnDeepDark = document.getElementById("theme-deep-dark");

  if (btnDark) btnDark.addEventListener("click", () => setTheme("dark"));
  if (btnLight) btnLight.addEventListener("click", () => setTheme("light"));
  if (btnGray) btnGray.addEventListener("click", () => setTheme("gray"));
  if (btnRed) btnRed.addEventListener("click", () => setTheme("red"));
  if (btnPink) btnPink.addEventListener("click", () => setTheme("pink"));
  if (btnCyberpank) btnCyberpank.addEventListener("click", () => setTheme("cyberpank"));
  if (btnDeepDark) btnDeepDark.addEventListener("click", () => setTheme("deep-dark"));
});
