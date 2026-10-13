(function () {
  "use strict";
  const { $, api, escapeHtml, toast } = window.RS;

  $("logoutBtn").addEventListener("click", async () => {
    try { await api("/api/auth/logout", { method: "POST" }); } catch (e) { /* ignore */ }
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
      a.innerHTML =
        "<h3>" + escapeHtml(r.name) + "</h3>" +
        '<div class="meta">' + r.member_count + " member" + (r.member_count === 1 ? "" : "s") + "</div>" +
        '<span class="code-tag">' + escapeHtml(r.code) + "</span>";
      grid.appendChild(a);
    });
  }

  $("createRoomBtn").addEventListener("click", async () => {
    const name = $("newRoomName").value.trim();
    if (!name) { toast("Give your room a name first.", "error"); return; }
    try {
      const room = await api("/api/rooms", { method: "POST", body: JSON.stringify({ name }) });
      window.location.href = "/room/" + room.code;
    } catch (e) { toast(e.message, "error"); }
  });

  $("joinRoomBtn").addEventListener("click", async () => {
    const code = $("joinCode").value.trim();
    if (!code) { toast("Enter the invite code.", "error"); return; }
    try {
      const room = await api("/api/rooms/join", { method: "POST", body: JSON.stringify({ code }) });
      window.location.href = "/room/" + room.code;
    } catch (e) { toast(e.message, "error"); }
  });

  loadRooms().catch((e) => toast(e.message, "error"));
})();
