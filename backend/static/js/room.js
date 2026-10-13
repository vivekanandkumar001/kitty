(function () {
  "use strict";
  const { $, api, escapeHtml, toast, money: fmt } = window.RS;

  const ROOM_CODE = window.__ROOM_CODE__;
  const ME = window.__ME__;

  let members = []; // active room memberships

  function flashButton(btn, doneText) {
    const original = btn.textContent;
    btn.textContent = doneText;
    setTimeout(() => (btn.textContent = original), 1400);
  }

  // ---------------- Top bar ----------------
  $("logoutBtn").addEventListener("click", async () => {
    try { await api("/api/auth/logout", { method: "POST" }); } catch (e) { /* ignore */ }
    window.location.href = "/login";
  });
  $("copyCodeBtn").addEventListener("click", () => {
    if (navigator.clipboard) navigator.clipboard.writeText(ROOM_CODE);
    flashButton($("copyCodeBtn"), "Copied!");
  });
  $("copyLinkBtn2").addEventListener("click", () => {
    if (navigator.clipboard) navigator.clipboard.writeText(window.location.origin + "/room/" + ROOM_CODE);
    flashButton($("copyLinkBtn2"), "Copied!");
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

  // ---------------- Add-expense modal ----------------
  const modal = $("addExpenseModal");
  function openModal() {
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    $("expAmount").focus();
  }
  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }
  $("openAddExpense").addEventListener("click", openModal);
  $("closeAddExpense").addEventListener("click", closeModal);
  document.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", closeModal));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  // ---------------- Shared: load members for dropdowns ----------------
  async function loadMembersForForms() {
    const all = await api("/api/rooms/" + ROOM_CODE + "/members");
    members = all.filter((m) => m.status === "active");
    const opts = members
      .map((m) => '<option value="' + m.user_id + '">' + escapeHtml(m.name) + (m.user_id === ME.id ? " (you)" : "") + "</option>")
      .join("");
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
    el.className = "ledger-amount" + (bal > 0 ? " owed" : bal < 0 ? " owe" : "");
    $("dashBalanceLabel").textContent = bal > 0 ? "Owed to you" : bal < 0 ? "You owe" : "Your balance";
    $("dashMonthTotal").textContent = fmt(d.month_total);
    $("dashPendingCount").textContent = d.pending_recurring.length;

    const catBox = $("dashCategories");
    catBox.innerHTML = "";
    $("dashCatEmpty").hidden = d.top_categories.length !== 0;
    d.top_categories.forEach((c) => {
      const row = document.createElement("div");
      row.className = "expense-row";
      row.innerHTML = '<span class="cat-chip">' + escapeHtml(c.category) + '</span><span class="expense-amount">' + fmt(c.amount) + "</span>";
      catBox.appendChild(row);
    });

    const recentBox = $("dashRecent");
    recentBox.innerHTML = "";
    if (!d.recent_expenses.length) {
      recentBox.innerHTML = '<p class="empty-state">No expenses yet.</p>';
    }
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
    const statusChip = e.status !== "confirmed" ? '<span class="status-chip ' + e.status + '">' + escapeHtml(e.status) + "</span>" : "";
    row.innerHTML =
      '<div class="expense-left">' +
        '<span class="desc">' + escapeHtml(e.description || e.category) + "</span>" +
        '<span class="meta">' + e.expense_date + " \u00B7 paid by " + escapeHtml(e.paid_by_name) + " \u00B7 " + escapeHtml(e.split_type) + " split</span>" +
      "</div>" +
      '<div class="expense-right">' +
        '<span class="cat-chip">' + escapeHtml(e.category) + "</span>" + statusChip +
        '<span class="expense-amount">' + fmt(e.amount) + "</span>" +
        '<button class="row-btn" data-del="' + e.id + '" title="Delete expense" aria-label="Delete expense">&times;</button>' +
      "</div>";
    row.querySelector("[data-del]").addEventListener("click", async () => {
      if (!confirm("Delete this expense?")) return;
      try {
        await api("/api/rooms/" + ROOM_CODE + "/expenses/" + e.id, { method: "DELETE" });
        toast("Expense deleted.", "success");
        loadExpenses();
        loadDashboard();
      } catch (err) { toast(err.message, "error"); }
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
      box.innerHTML = '<p class="muted small" style="margin:0;">Splits equally across all active members.</p>';
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
    }
  }
  $("expSplitType").addEventListener("change", renderSplitConfig);

  $("addExpenseBtn").addEventListener("click", async () => {
    const amount = parseFloat($("expAmount").value);
    if (!amount || amount <= 0) { toast("Enter a valid amount.", "error"); return; }
    const splitType = $("expSplitType").value;
    const payload = {
      amount,
      category: $("expCategory").value,
      description: $("expDescription").value,
      paid_by: parseInt($("expPaidBy").value, 10),
      split_type: splitType,
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
      $("expAmount").value = "";
      $("expDescription").value = "";
      closeModal();
      toast("Expense added.", "success");
      loadDashboard();
    } catch (e) { toast(e.message, "error"); }
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
    try {
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
        row.innerHTML =
          '<span class="flow">' + escapeHtml(t.from_name) + '<span class="arrow">\u2192</span>' + escapeHtml(t.to_name) + "</span>" +
          '<span class="expense-amount">' + fmt(t.amount) + "</span>";

        // Build the payment link through the DOM API — never interpolate a
        // user-supplied URL into innerHTML (that was a stored-XSS vector).
        if (t.upi_link) {
          const pay = document.createElement("a");
          pay.className = "upi-btn";
          pay.textContent = "Pay via UPI";
          pay.href = t.upi_link;
          row.appendChild(pay);
        } else {
          const pay = document.createElement("span");
          pay.className = "upi-btn disabled";
          pay.title = "They have not added a UPI ID yet";
          pay.textContent = "No UPI ID";
          row.appendChild(pay);
        }

        const markBtn = document.createElement("button");
        markBtn.className = "mark-paid-btn";
        markBtn.textContent = "Mark as paid";
        markBtn.dataset.from = t.from_user;
        markBtn.dataset.to = t.to_user;
        markBtn.dataset.amt = t.amount;
        markBtn.addEventListener("click", async () => {
          try {
            await api("/api/rooms/" + ROOM_CODE + "/settlements", {
              method: "POST",
              body: JSON.stringify({ from_user: markBtn.dataset.from, to_user: markBtn.dataset.to, amount: markBtn.dataset.amt, method: "upi" }),
            });
            toast("Settlement recorded.", "success");
            loadBalancesTab();
          } catch (err) { toast(err.message, "error"); }
        });
        row.appendChild(markBtn);
        box.appendChild(row);
      });
    } catch (e) { toast(e.message, "error"); }
  });

  $("recordSettleBtn").addEventListener("click", async () => {
    const from = $("settleFrom").value, to = $("settleTo").value;
    const amount = parseFloat($("settleAmount").value);
    if (from === to) { toast("Choose two different members.", "error"); return; }
    if (!amount || amount <= 0) { toast("Enter a valid amount.", "error"); return; }
    try {
      await api("/api/rooms/" + ROOM_CODE + "/settlements", {
        method: "POST",
        body: JSON.stringify({ from_user: from, to_user: to, amount, method: $("settleMethod").value }),
      });
      $("settleAmount").value = "";
      toast("Settlement recorded.", "success");
      loadBalancesTab();
    } catch (e) { toast(e.message, "error"); }
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
        '<span class="meta">' + new Date(s.created_at).toLocaleDateString("en-IN") + " \u00B7 " + escapeHtml(s.method) + "</span></div>" +
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
      '<span class="meta">' + fmt(r.amount) + " \u00B7 " + escapeHtml(r.category) + " \u00B7 paid by " + escapeHtml(r.paid_by_name) + " \u00B7 due day " + r.day_of_month + "</span></div>" +
      '<button class="gen-btn ' + (done ? "done" : "") + '" data-id="' + r.id + '">' + (done ? "Generated" : "Generate this month") + "</button>";
    const btn = row.querySelector(".gen-btn");
    if (!done) {
      btn.addEventListener("click", async () => {
        try {
          await api("/api/rooms/" + ROOM_CODE + "/recurring/" + r.id + "/generate", { method: "POST" });
          toast("Generated this month's expense.", "success");
          loadRecurring();
          loadDashboard();
        } catch (e) { toast(e.message, "error"); }
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
    if (!name || !amount) { toast("Enter a name and amount.", "error"); return; }
    try {
      await api("/api/rooms/" + ROOM_CODE + "/recurring", {
        method: "POST",
        body: JSON.stringify({
          name, amount, category: $("recCategory").value,
          paid_by: parseInt($("recPaidBy").value, 10),
          day_of_month: parseInt($("recDay").value, 10) || 1,
        }),
      });
      $("recName").value = "";
      $("recAmount").value = "";
      toast("Template saved.", "success");
      loadRecurring();
    } catch (e) { toast(e.message, "error"); }
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
        '<div class="member-role">' + escapeHtml(m.role) + "</div></div>" +
        (exited || m.user_id === ME.id ? "" : '<button class="exit-btn" data-uid="' + m.user_id + '">Mark as moved out</button>');
      const exitBtn = row.querySelector(".exit-btn");
      if (exitBtn) {
        exitBtn.addEventListener("click", async () => {
          if (!confirm(m.name + " — mark as moved out? Their final settlement will be calculated.")) return;
          try {
            const result = await api("/api/rooms/" + ROOM_CODE + "/members/" + m.user_id + "/exit", { method: "POST" });
            toast(m.name + "'s final settlement: " + fmt(Math.abs(result.final_settlement)) +
                  (result.final_settlement_minor >= 0 ? " owed to them." : " they owe the room."), "success");
            loadMembers();
            loadMembersForForms();
          } catch (e) { toast(e.message, "error"); }
        });
      }
      box.appendChild(row);
    });
    $("upiIdInput").value = ME.upi_id || "";
  }

  $("saveUpiBtn").addEventListener("click", async () => {
    try {
      const upi = $("upiIdInput").value.trim();
      await api("/api/auth/me", { method: "PUT", body: JSON.stringify({ upi_id: upi }) });
      ME.upi_id = upi;
      toast("UPI ID saved.", "success");
    } catch (e) { toast(e.message, "error"); }
  });

  // ---------------- Init ----------------
  $("expDate").value = new Date().toISOString().slice(0, 10);
  (async function init() {
    try {
      await loadMembersForForms();
      await loadDashboard();
    } catch (e) { toast(e.message, "error"); }
  })();
})();
