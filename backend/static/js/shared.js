// Shared helpers for RoomSplit pages. Exposed on window.RS.
window.RS = (function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  async function api(path, opts) {
    const res = await fetch(path, Object.assign(
      { headers: { "Content-Type": "application/json" } },
      opts
    ));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Something went wrong.");
    return body;
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : str;
    return d.innerHTML;
  }

  function toastStack() {
    let stack = $("toastStack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "toastStack";
      stack.className = "toast-stack";
      stack.setAttribute("aria-live", "polite");
      document.body.appendChild(stack);
    }
    return stack;
  }

  function toast(message, type) {
    const stack = toastStack();
    const el = document.createElement("div");
    el.className = "toast" + (type ? " toast-" + type : "");
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .25s ease, transform .25s ease";
      el.style.opacity = "0";
      el.style.transform = "translateY(6px)";
      setTimeout(() => el.remove(), 260);
    }, 2600);
  }

  const money = (n) =>
    "\u20B9" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return { $, api, escapeHtml, toast, money };
})();
