(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const ROOM_CODE = window.__ROOM_CODE__;
  const ME = window.__ME__;
  const fmt = (n) => "\u20B9" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let members = []; // active room memberships

  async function api(path, opts) {
    const res = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Something went wrong.");
    return body;
  }
  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : str;
    return d.innerHTML;
  }

  // ---------------- Top bar ----------------
  $("logoutBtn").addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  });
  $("copyCodeBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(ROOM_CODE);
    $("copyCodeBtn").textContent = "Copied!";
    setTimeout(() => ($("copyCodeBtn").textContent = "Copy invite"), 1400);
  });
  $("copyLinkBtn2").addEventListener("click", () => {
    navigator.clipboard.writeText(window.location.origin + "/room/" + ROOM_CODE);
    $("copyLinkBtn2").textContent = "Copied!";
    setTimeout(() => ($("copyLinkBtn2").textContent = "Copy join link"), 1400);
  });

  // ---------------- Tabs ----------------
  document.querySelectorAll(".room-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".room-tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      $("panel-" + btn.dataset.tab).classList.add("active");
      const loaders = { dashboard: loadDashboard, expenses: loadExpenses, balances: loadBalancesTab,
                         recurring: loadRecurring, members: loadMembers };
      if (loaders[btn.dataset.tab]) loaders[btn.dataset.tab]();
    });
  });

  // ---------------- Shared: load members for dropdowns ----------------
  async function loadMembersForForms() {
    const all = await api("/api/rooms/" + ROOM_CODE + "/members");
    members = all.filter((m) => m.status === "active");
    const opts = members.map((m) => '<option value="' + m.user_id + '">' + escapeHtml(m.name) + (m.user_id === ME.id ? " (you)" : "") + "</option>").join("");
    ["expPaidBy", "recPaidBy", "settleFrom", "settleTo"].forEach((id) => {
      if ($(id)) $(id).innerHTML = opts;
    });
    if ($("expPaidBy")) $("expPaidBy").value = ME.id;
    if ($("recPaidBy")) $("recPaidBy").value = ME.id;
    renderSplitConfig();
  }

  // ---------------- Dashboard ----------------
  async function loadDashboard() {
    const d = await api("/api/rooms/" + ROOM_CODE + "/dashboard");
    const bal = d.my_balance;
    const el = $("dashMyBalance");
    el.textContent = fmt(Math.abs(bal));
    el.className = "lt-amount " + (bal > 0 ? "owed" : bal < 0 ? "owe" : "");
    if (bal !== 0) el.textContent += bal > 0 ? " owed to you" : " you owe";
    $("dashMonthTotal").textContent = fmt(d.month_total);
    $("dashPendingCount").textContent = d.pending_recurring.length;

    const catBox = $("dashCategories");
    catBox.innerHTML = "";
    $("dashCatEmpty").hidden = d.top_categories.length !== 0;
    d.top_categories.forEach((c) => {
      const row = document.createElement("div");
      row.className = "expense-row";
      row.innerHTML = '<span class="cat-chip">' + c.category + "</span><span class=\"expense-amount\">" + fmt(c.amount) + "</span>";
      catBox.appendChild(row);
    });

    const recentBox = $("dashRecent");
    recentBox.innerHTML = "";
    d.recent_expenses.forEach((e) => recentBox.appendChild(expenseRowEl(e)));

    if (d.pending_recurring.length) {
      $("dashRecurringCard").hidden = false;
      const box = $("dashRecurring");
      box.innerHTML = "";
      d.pending_recurring.forEach((r) => box.appendChild(recurringRowEl(r)));
    } else {
      $("dashRecurringCard").hidden = true;
    }
  }

  $("exportCsvBtn").addEventListener("click", () => {
    window.location.href = "/api/rooms/" + ROOM_CODE + "/reports/monthly.csv";
  });

  // ---------------- Expenses list ----------------
  function expenseRowEl(e) {
    const row = document.createElement("div");
    row.className = "expense-row";
    const statusChip = e.status !== "confirmed" ? '<span class="status-chip ' + e.status + '">' + e.status + "</span>" : "";
    row.innerHTML =
      '<div class="expense-left">' +
        '<span class="desc">' + escapeHtml(e.description || e.category) + "</span>" +
        '<span class="meta">' + e.expense_date + " \u00B7 paid by " + escapeHtml(e.paid_by_name) + " \u00B7 " + e.split_type + " split</span>" +
      "</div>" +
      '<div class="expense-right">' +
        '<span class="cat-chip">' + e.category + "</span>" + statusChip +
        '<span class="expense-amount">' + fmt(e.amount) + "</span>" +
        '<button class="row-btn" data-del="' + e.id + '" title="Delete">&times;</button>' +
      "</div>";
    row.querySelector("[data-del]").addEventListener("click", async () => {
      if (!confirm("Delete this expense?")) return;
      await api("/api/rooms/" + ROOM_CODE + "/expenses/" + e.id, { method: "DELETE" });
      loadExpenses(); loadDashboard();
    });
    return row;
  }

  async function loadExpenses() {
    const list = await api("/api/rooms/" + ROOM_CODE + "/expenses");
    const box = $("expenseList");
    box.innerHTML = "";
    $("expenseEmpty").hidden = list.length !== 0;
    list.forEach((e) => box.appendChild(expenseRowEl(e)));
  }

  // ---------------- Add expense (split config UI) ----------------
  function renderSplitConfig() {
    const type = $("expSplitType").value;
    const box = $("splitConfig");
    box.innerHTML = "";
    if (type === "equal") {
      box.innerHTML = '<p style="font-size:.85rem;color:var(--slate);margin:0;">Splits equally across all active members.</p>';
      return;
    }
    if (type === "attendance") {
      members.forEach((m) => {
        const row = document.createElement("div");
        row.className = "member-row";
        row.innerHTML = '<label><input type="checkbox" class="present-check" value="' + m.user_id + '" checked> ' + escapeHtml(m.name) + "</label>";
        box.appendChild(row);
      });
      return;
    }
    if (type === "custom") {
      members.forEach((m) => {
        const row = document.createElement("div");
        row.className = "member-row";
        row.innerHTML = escapeHtml(m.name) + ' <input type="number" class="custom-amt" data-user="' + m.user_id + '" min="0" step="0.01" placeholder="0.00">';
        box.appendChild(row);
      });
      return;
    }
    if (type === "percentage") {
      members.forEach((m) => {
        const row = document.createElement("div");
        row.className = "member-row";
        row.innerHTML = escapeHtml(m.name) + ' <input type="number" class="pct-amt" data-user="' + m.user_id + '" min="0" max="100" step="0.1" placeholder="%">';
        box.appendChild(row);
      });
      return;
    }
  }
  $("expSplitType").addEventListener("change", renderSplitConfig);

  $("addExpenseBtn").addEventListener("click", async () => {
    const amount = parseFloat($("expAmount").value);
    if (!amount || amount <= 0) { alert("Sahi amount daalo."); return; }
    const splitType = $("expSplitType").value;
    const payload = {
      amount, category: $("expCategory").value, description: $("expDescription").value,
      paid_by: parseInt($("expPaidBy").value, 10), split_type: splitType,
      expense_date: $("expDate").value || undefined,
    };
    if (splitType === "attendance") {
      payload.present_user_ids = Array.from(document.querySelectorAll(".present-check:checked")).map((c) => parseInt(c.value, 10));
    } else if (splitType === "custom") {
      const shares = {};
      document.querySelectorAll(".custom-amt").forEach((inp) => { shares[inp.dataset.user] = parseFloat(inp.value) || 0; });
      payload.shares = shares;
    } else if (splitType === "percentage") {
      const pct = {};
      document.querySelectorAll(".pct-amt").forEach((inp) => { pct[inp.dataset.user] = parseFloat(inp.value) || 0; });
      payload.percentages = pct;
    }
    try {
      await api("/api/rooms/" + ROOM_CODE + "/expenses", { method: "POST", body: JSON.stringify(payload) });
      $("expAmount").value = ""; $("expDescription").value = "";
      alert("Expense added.");
      loadDashboard();
    } catch (e) { alert(e.message); }
  });

  // ---------------- Balances ----------------
  async function loadBalancesTab() {
    const balances = await api("/api/rooms/" + ROOM_CODE + "/balances");
    const box = $("balanceList");
    box.innerHTML = "";
    balances.forEach((b) => {
      const cls = b.balance_minor > 0 ? "owed" : b.balance_minor < 0 ? "owe" : "zero";
      const label = b.balance_minor > 0 ? "is owed" : b.balance_minor < 0 ? "owes" : "settled up";
      const row = document.createElement("div");
      row.className = "balance-row";
      row.innerHTML =
        "<span>" + escapeHtml(b.name) + (b.user_id === ME.id ? " (you)" : "") + "</span>" +
        '<span class="balance-amount ' + cls + '">' + label + " " + fmt(Math.abs(b.balance)) + "</span>";
      box.appendChild(row);
    });

    await loadSettleHistory();
  }

  $("simplifyBtn").addEventListener("click", async () => {
    const tx = await api("/api/rooms/" + ROOM_CODE + "/debts/simplify", { method: "POST" });
    const box = $("simplifyResults");
    box.innerHTML = "";
    if (!tx.length) {
      box.innerHTML = '<p class="empty-state">Everyone is settled up. Nothing to simplify.</p>';
      return;
    }
    tx.forEach((t) => {
      const row = document.createElement("div");
      row.className = "simplify-row";
      const upiBtn = t.upi_link
        ? '<a class="upi-btn" href="' + t.upi_link + '">Pay via UPI</a>'
        : '<span class="upi-btn disabled" title="They have not added a UPI ID yet">No UPI ID</span>';
      row.innerHTML =
        '<span class="flow">' + escapeHtml(t.from_name) + '<span class="arrow">&#8594;</span>' + escapeHtml(t.to_name) + "</span>" +
        '<span class="expense-amount">' + fmt(t.amount) + "</span>" +
        upiBtn +
        '<button class="mark-paid-btn" data-from="' + t.from_user + '" data-to="' + t.to_user + '" data-amt="' + t.amount + '">Mark as paid</button>';
      row.querySelector(".mark-paid-btn").addEventListener("click", async (ev) => {
        const btn = ev.currentTarget;
        await api("/api/rooms/" + ROOM_CODE + "/settlements", {
          method: "POST",
          body: JSON.stringify({ from_user: btn.dataset.from, to_user: btn.dataset.to, amount: btn.dataset.amt, method: "upi" }),
        });
        loadBalancesTab();
      });
      box.appendChild(row);
    });
  });

  $("recordSettleBtn").addEventListener("click", async () => {
    const from = $("settleFrom").value, to = $("settleTo").value;
    const amount = parseFloat($("settleAmount").value);
    if (from === to) { alert("From aur To alag members hone chahiye."); return; }
    if (!amount || amount <= 0) { alert("Sahi amount daalo."); return; }
    try {
      await api("/api/rooms/" + ROOM_CODE + "/settlements", {
        method: "POST",
        body: JSON.stringify({ from_user: from, to_user: to, amount, method: $("settleMethod").value }),
      });
      $("settleAmount").value = "";
      loadBalancesTab();
    } catch (e) { alert(e.message); }
  });

  async function loadSettleHistory() {
    const list = await api("/api/rooms/" + ROOM_CODE + "/settlements");
    const box = $("settleHistory");
    box.innerHTML = "";
    $("settleEmpty").hidden = list.length !== 0;
    list.forEach((s) => {
      const row = document.createElement("div");
      row.className = "expense-row";
      row.innerHTML =
        '<div class="expense-left"><span class="desc">' + escapeHtml(s.from_name) + " \u2192 " + escapeHtml(s.to_name) + "</span>" +
        '<span class="meta">' + new Date(s.created_at).toLocaleDateString("en-IN") + " \u00B7 " + s.method + "</span></div>" +
        '<span class="expense-amount">' + fmt(s.amount) + "</span>";
      box.appendChild(row);
    });
  }

  // ---------------- Recurring ----------------
  function recurringRowEl(r) {
    const row = document.createElement("div");
    row.className = "recurring-row";
    const done = r.last_generated_month === new Date().toISOString().slice(0, 7);
    row.innerHTML =
      '<div class="expense-left"><span class="desc">' + escapeHtml(r.name) + "</span>" +
      '<span class="meta">' + fmt(r.amount) + " \u00B7 " + r.category + " \u00B7 paid by " + escapeHtml(r.paid_by_name) + " \u00B7 due day " + r.day_of_month + "</span></div>" +
      '<button class="gen-btn ' + (done ? "done" : "") + '" data-id="' + r.id + '">' + (done ? "Generated" : "Generate this month") + "</button>";
    const btn = row.querySelector(".gen-btn");
    if (!done) {
      btn.addEventListener("click", async () => {
        try {
          await api("/api/rooms/" + ROOM_CODE + "/recurring/" + r.id + "/generate", { method: "POST" });
          loadRecurring(); loadDashboard();
        } catch (e) { alert(e.message); }
      });
    }
    return row;
  }

  async function loadRecurring() {
    const list = await api("/api/rooms/" + ROOM_CODE + "/recurring");
    const box = $("recurringList");
    box.innerHTML = "";
    $("recurringEmpty").hidden = list.length !== 0;
    list.forEach((r) => box.appendChild(recurringRowEl(r)));
  }

  $("addRecurringBtn").addEventListener("click", async () => {
    const name = $("recName").value.trim();
    const amount = parseFloat($("recAmount").value);
    if (!name || !amount) { alert("Naam aur amount daalo."); return; }
    try {
      await api("/api/rooms/" + ROOM_CODE + "/recurring", {
        method: "POST",
        body: JSON.stringify({
          name, amount, category: $("recCategory").value,
          paid_by: parseInt($("recPaidBy").value, 10), day_of_month: parseInt($("recDay").value, 10) || 1,
        }),
      });
      $("recName").value = ""; $("recAmount").value = "";
      loadRecurring();
    } catch (e) { alert(e.message); }
  });

  // ---------------- Members ----------------
  async function loadMembers() {
    const all = await api("/api/rooms/" + ROOM_CODE + "/members");
    const box = $("membersList");
    box.innerHTML = "";
    all.forEach((m) => {
      const row = document.createElement("div");
      row.className = "member-card";
      const exited = m.status === "exited";
      row.innerHTML =
        '<div><div class="member-name">' + escapeHtml(m.name) + (m.user_id === ME.id ? " (you)" : "") + (exited ? " \u2014 left" : "") + "</div>" +
        '<div class="member-role">' + m.role + "</div></div>" +
        (exited || m.user_id === ME.id ? "" : '<button class="exit-btn" data-uid="' + m.user_id + '">Mark as moved out</button>');
      const exitBtn = row.querySelector(".exit-btn");
      if (exitBtn) {
        exitBtn.addEventListener("click", async () => {
          if (!confirm(m.name + " ko moved-out mark karein? Final settlement calculate hoga.")) return;
          const result = await api("/api/rooms/" + ROOM_CODE + "/members/" + m.user_id + "/exit", { method: "POST" });
          alert(m.name + "'s final settlement: " + fmt(Math.abs(result.final_settlement)) +
                (result.final_settlement_minor >= 0 ? " owed to them." : " they owe the room."));
          loadMembers(); loadMembersForForms();
        });
      }
      box.appendChild(row);
    });
    $("upiIdInput").value = ME.upi_id || "";
  }

  $("saveUpiBtn").addEventListener("click", async () => {
    const upi = $("upiIdInput").value.trim();
    await api("/api/auth/me", { method: "PUT", body: JSON.stringify({ upi_id: upi }) });
    ME.upi_id = upi;
    alert("UPI ID saved.");
  });

  // ---------------- Init ----------------
  $("expDate").value = new Date().toISOString().slice(0, 10);
  (async function init() {
    await loadMembersForForms();
    await loadDashboard();
  })();
})();
