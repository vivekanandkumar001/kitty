(function () {
  "use strict";
  const { $, api } = window.RS;

  function showError(msg) {
    const box = $("errorBox");
    box.textContent = msg;
    box.hidden = false;
  }

  let mode = "login";

  function setMode(next) {
    mode = next;
    const isLogin = mode === "login";
    $("loginForm").hidden = !isLogin;
    $("signupForm").hidden = isLogin;
    $("authTitle").textContent = isLogin ? "Welcome back" : "Create your account";
    $("authSub").textContent = isLogin
      ? "Log in to see who owes whom."
      : "Set up your account in a few seconds.";
    $("switchText").textContent = isLogin ? "New here?" : "Already have an account?";
    $("switchBtn").textContent = isLogin ? "Create an account" : "Log in";
    $("errorBox").hidden = true;
  }

  $("switchBtn").addEventListener("click", () => setMode(mode === "login" ? "signup" : "login"));

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone: $("loginPhone").value.trim(), pin: $("loginPin").value.trim() }),
      });
      window.location.href = "/rooms";
    } catch (err) {
      showError(err.message);
    }
  });

  $("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          name: $("signupName").value.trim(),
          phone: $("signupPhone").value.trim(),
          pin: $("signupPin").value.trim(),
        }),
      });
      window.location.href = "/rooms";
    } catch (err) {
      showError(err.message);
    }
  });

  // Deep-link support: /login?mode=signup opens the register form directly.
  const params = new URLSearchParams(window.location.search);
  setMode(params.get("mode") === "signup" ? "signup" : "login");
})();
