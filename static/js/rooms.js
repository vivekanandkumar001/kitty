(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  async function api(path, opts) {
    const res = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Something went wrong.");
    return body;
  }

  $("logoutBtn").addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  });

  async function loadRooms() {
    const rooms = await api("/api/rooms");
    const grid = $("roomsGrid");
    grid.innerHTML = "";
    $("roomsEmpty").hidden = rooms.length !== 0;
    rooms.forEach((r) => {
      const a = document.createElement("a");
      a.href = "/room/" + r.code;
      a.className = "room-card";
      a.style.display = "block";
      a.innerHTML =
        "<h3>" + escapeHtml(r.name) + "</h3>" +
        '<div class="meta">' + r.member_count + " member" + (r.member_count === 1 ? "" : "s") + "</div>" +
        '<span class="code-tag">' + r.code + "</span>";
      grid.appendChild(a);
    });
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  $("createRoomBtn").addEventListener("click", async () => {
    const name = $("newRoomName").value.trim();
    if (!name) { alert("Room ka naam daalo."); return; }
    try {
      const room = await api("/api/rooms", { method: "POST", body: JSON.stringify({ name }) });
      window.location.href = "/room/" + room.code;
    } catch (e) { alert(e.message); }
  });

  $("joinRoomBtn").addEventListener("click", async () => {
    const code = $("joinCode").value.trim();
    if (!code) { alert("Room code daalo."); return; }
    try {
      const room = await api("/api/rooms/join", { method: "POST", body: JSON.stringify({ code }) });
      window.location.href = "/room/" + room.code;
    } catch (e) { alert(e.message); }
  });

  loadRooms();
})();
