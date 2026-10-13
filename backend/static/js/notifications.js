// In-app notifications: bell + unread badge + dropdown panel.
// Depends on shared.js (window.RS). Safe to load on pages without a bell.
(function () {
  "use strict";

  const { $, api } = window.RS;
  const root = $("notifRoot");
  if (!root) return; // page has no notification bell

  const bell = $("notifBell");
  const panel = $("notifPanel");
  const badge = $("notifBadge");
  const list = $("notifList");
  const empty = $("notifEmpty");
  const markAllBtn = $("notifMarkAll");

  const POLL_MS = 30000;
  let items = [];
  let unread = 0;
  let open = false;

  function fmtTime(iso) {
    const then = new Date(iso).getTime();
    if (!then) return "";
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    const days = Math.floor(hrs / 24);
    if (days < 7) return days + "d ago";
    return new Date(iso).toLocaleDateString("en-IN");
  }

  function setBadge(n) {
    unread = n;
    if (n > 0) {
      badge.hidden = false;
      badge.textContent = n > 9 ? "9+" : String(n);
    } else {
      badge.hidden = true;
      badge.textContent = "0";
    }
    bell.classList.toggle("has-unread", n > 0);
    bell.setAttribute("aria-label", n > 0 ? "Notifications, " + n + " unread" : "Notifications");
  }

  function render() {
    list.textContent = "";
    empty.hidden = items.length !== 0;
    items.forEach((it) => {
      // Build with DOM APIs so notification text is never parsed as HTML.
      const row = document.createElement(it.link ? "a" : "div");
      row.className = "notif-item" + (it.read ? "" : " unread");
      if (it.link) row.href = it.link;

      const dot = document.createElement("span");
      dot.className = "notif-dot";
      dot.setAttribute("aria-hidden", "true");

      const main = document.createElement("span");
      main.className = "notif-main";

      const title = document.createElement("span");
      title.className = "notif-title";
      title.textContent = it.title || "";

      const time = document.createElement("span");
      time.className = "notif-time";
      time.textContent = fmtTime(it.created_at);

      main.appendChild(title);
      if (it.body) {
        const body = document.createElement("span");
        body.className = "notif-body";
        body.textContent = it.body;
        main.appendChild(body);
      }
      main.appendChild(time);

      row.appendChild(dot);
      row.appendChild(main);
      list.appendChild(row);
    });
  }

  async function load() {
    try {
      const data = await api("/api/notifications");
      items = Array.isArray(data.items) ? data.items : [];
      setBadge(data.unread || 0);
      render();
    } catch (e) {
      /* Notifications are best-effort; never break the page over them. */
    }
  }

  async function markAllRead() {
    if (unread === 0) return;
    // Reflect read state locally without re-rendering, so the user can still
    // see which items were new during this view.
    items = items.map((it) => Object.assign({}, it, { read: true }));
    setBadge(0);
    try {
      await api("/api/notifications/read", { method: "POST", body: JSON.stringify({}) });
    } catch (e) {
      /* ignore — the badge clears optimistically */
    }
  }

  function togglePanel(force) {
    open = typeof force === "boolean" ? force : !open;
    panel.hidden = !open;
    bell.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) markAllRead();
  }

  bell.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePanel();
  });
  markAllBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    markAllRead();
  });
  document.addEventListener("click", (e) => {
    if (open && !root.contains(e.target)) togglePanel(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) {
      togglePanel(false);
      bell.focus();
    }
  });

  load();
  setInterval(load, POLL_MS);
})();
