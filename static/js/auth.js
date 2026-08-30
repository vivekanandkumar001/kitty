(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  async function api(path, opts) {
    const res = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Something went wrong.");
    return body;
  }

  function showError(msg) {
    $("errorBox").textContent = msg;
    $("errorBox").hidden = false;
  }

  let mode = "login";
  $("switchBtn").addEventListener("click", () => {
    mode = mode === "login" ? "signup" : "login";
    $("loginForm").hidden = mode !== "login";
    $("signupForm").hidden = mode !== "signup";
    $("authSub").textContent = mode === "login" ? "Log in to see who owes whom." : "Set up your account in a few seconds.";
    $("switchText").textContent = mode === "login" ? "New here?" : "Already have an account?";
    $("switchBtn").textContent = mode === "login" ? "Create an account" : "Log in";
    $("errorBox").hidden = true;
  });

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone: $("loginPhone").value.trim(), pin: $("loginPin").value.trim() }),
      });
      window.location.href = "/rooms";
    } catch (err) { showError(err.message); }
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
    } catch (err) { showError(err.message); }
  });
})();
