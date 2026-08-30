import { useState, useRef, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type User = { id: string; name: string; phone: string };

type Expense = {
  id: string;
  description: string;
  amount: number;
  paidBy: string; // user id
  splitWith: string[]; // user ids (including payer)
  date: string;
  category: Category;
};

type Category = "food" | "rent" | "utilities" | "transport" | "entertainment" | "other";

type Screen = "auth" | "room";

// ─── Seed Data ────────────────────────────────────────────────────────────────

const SEED_USERS: User[] = [
  { id: "u1", name: "Jordan Lee", phone: "5550001111" },
  { id: "u2", name: "Sam Rivera", phone: "5550002222" },
  { id: "u3", name: "Alex Kim", phone: "5550003333" },
];

const SEED_EXPENSES: Expense[] = [
  {
    id: "e1", description: "Groceries — Whole Foods", amount: 127.40,
    paidBy: "u1", splitWith: ["u1","u2","u3"], date: "2026-08-28", category: "food",
  },
  {
    id: "e2", description: "August rent", amount: 3600,
    paidBy: "u2", splitWith: ["u1","u2","u3"], date: "2026-08-01", category: "rent",
  },
  {
    id: "e3", description: "Netflix + Spotify bundle", amount: 38,
    paidBy: "u3", splitWith: ["u1","u2","u3"], date: "2026-08-10", category: "entertainment",
  },
  {
    id: "e4", description: "Electricity bill", amount: 94.20,
    paidBy: "u1", splitWith: ["u1","u2","u3"], date: "2026-08-15", category: "utilities",
  },
  {
    id: "e5", description: "Pizza night", amount: 62,
    paidBy: "u2", splitWith: ["u1","u2"], date: "2026-08-22", category: "food",
  },
  {
    id: "e6", description: "Uber — airport run", amount: 44,
    paidBy: "u1", splitWith: ["u1","u3"], date: "2026-08-25", category: "transport",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeBalances(expenses: Expense[], users: User[]) {
  const net: Record<string, number> = {};
  users.forEach(u => (net[u.id] = 0));

  for (const exp of expenses) {
    const share = exp.amount / exp.splitWith.length;
    exp.splitWith.forEach(uid => {
      net[uid] -= share;
      net[exp.paidBy] += share;
    });
  }
  return net;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(n));
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const CATEGORY_ICONS: Record<Category, string> = {
  food: "🍽",
  rent: "🏠",
  utilities: "⚡",
  transport: "🚗",
  entertainment: "🎬",
  other: "📦",
};

const CATEGORIES: Category[] = ["food", "rent", "utilities", "transport", "entertainment", "other"];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────

function AuthScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const registered = useRef<User[]>([...SEED_USERS]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "login") {
      const user = registered.current.find(u => u.phone === phone);
      if (!user) { setError("Phone number not found."); return; }
      if (pin !== "1234") { setError("Incorrect PIN."); return; }
      onLogin(user);
    } else {
      if (!name.trim()) { setError("Enter your name."); return; }
      if (phone.length < 10) { setError("Enter a valid phone number."); return; }
      if (pin.length !== 4) { setError("PIN must be 4 digits."); return; }
      const newUser: User = { id: uid(), name: name.trim(), phone };
      registered.current.push(newUser);
      onLogin(newUser);
    }
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-16"
      style={{ background: "var(--color-background)" }}>
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-12">
          <div className="inline-block bg-[var(--color-primary)] px-2 py-0.5 mb-3">
            <span className="text-xs font-bold tracking-widest uppercase" style={{ fontFamily: "var(--font-mono)" }}>
              ROOMSPLIT
            </span>
          </div>
          <h1 className="text-4xl font-bold leading-none" style={{ fontFamily: "var(--font-serif)" }}>
            Shared expenses,<br />sorted.
          </h1>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="block text-xs font-semibold tracking-widest uppercase mb-1.5"
                style={{ color: "var(--color-muted-foreground)" }}>
                Full name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jordan Lee"
                className="w-full border border-[var(--color-border)] bg-white px-4 py-3 text-base
                  focus:outline-none focus:border-[var(--color-foreground)] transition-colors"
                style={{ fontFamily: "var(--font-sans)" }}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase mb-1.5"
              style={{ color: "var(--color-muted-foreground)" }}>
              Phone number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="5550001111"
              className="w-full border border-[var(--color-border)] bg-white px-4 py-3 text-base
                focus:outline-none focus:border-[var(--color-foreground)] transition-colors"
              style={{ fontFamily: "var(--font-mono)" }}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase mb-1.5"
              style={{ color: "var(--color-muted-foreground)" }}>
              4-digit PIN
            </label>
            <input
              type="password"
              maxLength={4}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              className="w-full border border-[var(--color-border)] bg-white px-4 py-3 text-base tracking-widest
                focus:outline-none focus:border-[var(--color-foreground)] transition-colors"
              style={{ fontFamily: "var(--font-mono)" }}
            />
          </div>

          {error && (
            <p className="text-sm font-medium" style={{ color: "#e53e3e" }}>{error}</p>
          )}

          <button type="submit"
            className="w-full bg-[var(--color-foreground)] text-white py-3.5 font-semibold
              text-sm tracking-widest uppercase hover:bg-[var(--color-primary)] hover:text-[var(--color-foreground)]
              transition-colors duration-150">
            {mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            className="text-sm underline underline-offset-2 hover:text-[var(--color-muted-foreground)] transition-colors">
            {mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
          </button>
        </div>

        {mode === "login" && (
          <p className="mt-8 text-xs text-center" style={{ color: "var(--color-muted-foreground)", fontFamily: "var(--font-mono)" }}>
            Demo: phone 5550001111 · PIN 1234
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Balance Card ─────────────────────────────────────────────────────────────

function BalanceCard({ user, net, users }: { user: User; net: Record<string, number>; users: User[] }) {
  const balance = net[user.id] ?? 0;
  const isPositive = balance >= 0;

  return (
    <div className="border border-[var(--color-border)] bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="w-8 h-8 flex items-center justify-center font-bold text-sm mb-2"
            style={{ background: "var(--color-primary)" }}>
            {user.name.charAt(0)}
          </div>
          <p className="font-semibold text-sm">{user.name}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted-foreground)", fontFamily: "var(--font-mono)" }}>
            {user.phone}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold tracking-widest uppercase mb-1"
            style={{ color: "var(--color-muted-foreground)" }}>
            {isPositive ? "gets back" : "owes"}
          </p>
          <p className="text-xl font-bold" style={{
            fontFamily: "var(--font-mono)",
            color: isPositive ? "#16a34a" : "#e53e3e"
          }}>
            {fmt(balance)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Expense Row ──────────────────────────────────────────────────────────────

function ExpenseRow({ exp, users, currentUser }: { exp: Expense; users: User[]; currentUser: User }) {
  const payer = users.find(u => u.id === exp.paidBy)!;
  const share = exp.amount / exp.splitWith.length;
  const iOwed = exp.paidBy !== currentUser.id && exp.splitWith.includes(currentUser.id);
  const iPaid = exp.paidBy === currentUser.id;

  return (
    <div className="flex items-center gap-4 py-4 border-b border-[var(--color-border)] last:border-0">
      <div className="w-9 h-9 flex items-center justify-center text-lg flex-shrink-0"
        style={{ background: "var(--color-secondary)" }}>
        {CATEGORY_ICONS[exp.category]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{exp.description}</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted-foreground)" }}>
          {payer.name} · {fmtDate(exp.date)} · {exp.splitWith.length} people
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-bold text-sm" style={{ fontFamily: "var(--font-mono)" }}>
          {fmt(exp.amount)}
        </p>
        <p className="text-xs mt-0.5 font-medium" style={{
          fontFamily: "var(--font-mono)",
          color: iPaid ? "#16a34a" : iOwed ? "#e53e3e" : "var(--color-muted-foreground)"
        }}>
          {iPaid
            ? `+${fmt(exp.amount - share)}`
            : iOwed
            ? `-${fmt(share)}`
            : `–${fmt(share)}`}
        </p>
      </div>
    </div>
  );
}

// ─── Add Expense Modal ────────────────────────────────────────────────────────

function AddExpenseModal({
  users, currentUser, onAdd, onClose
}: {
  users: User[];
  currentUser: User;
  onAdd: (exp: Expense) => void;
  onClose: () => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(currentUser.id);
  const [splitWith, setSplitWith] = useState<string[]>(users.map(u => u.id));
  const [category, setCategory] = useState<Category>("other");
  const [error, setError] = useState("");

  function toggleSplit(uid: string) {
    setSplitWith(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!description.trim()) { setError("Add a description."); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Enter a valid amount."); return; }
    if (splitWith.length === 0) { setError("Select at least one person."); return; }
    if (!splitWith.includes(paidBy)) setSplitWith(prev => [...prev, paidBy]);
    onAdd({
      id: uid(),
      description: description.trim(),
      amount: amt,
      paidBy,
      splitWith: splitWith.includes(paidBy) ? splitWith : [...splitWith, paidBy],
      date: new Date().toISOString().split("T")[0],
      category,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white border-t-2 border-[var(--color-foreground)]
        sm:border-2 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="font-bold text-lg" style={{ fontFamily: "var(--font-serif)" }}>Add expense</h2>
          <button onClick={onClose} className="text-2xl leading-none hover:opacity-60 transition-opacity">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Description */}
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase mb-1.5"
              style={{ color: "var(--color-muted-foreground)" }}>Description</label>
            <input
              autoFocus
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What was this for?"
              className="w-full border border-[var(--color-border)] px-3 py-2.5 text-sm
                focus:outline-none focus:border-[var(--color-foreground)] transition-colors"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase mb-1.5"
              style={{ color: "var(--color-muted-foreground)" }}>Amount ($)</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full border border-[var(--color-border)] px-3 py-2.5 text-sm
                focus:outline-none focus:border-[var(--color-foreground)] transition-colors"
              style={{ fontFamily: "var(--font-mono)" }}
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase mb-1.5"
              style={{ color: "var(--color-muted-foreground)" }}>Category</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map(cat => (
                <button key={cat} type="button"
                  onClick={() => setCategory(cat)}
                  className="flex items-center gap-1.5 px-2 py-2 text-xs font-medium border transition-colors"
                  style={{
                    borderColor: category === cat ? "var(--color-foreground)" : "var(--color-border)",
                    background: category === cat ? "var(--color-primary)" : "transparent"
                  }}>
                  <span>{CATEGORY_ICONS[cat]}</span>
                  <span className="capitalize">{cat}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Paid by */}
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase mb-1.5"
              style={{ color: "var(--color-muted-foreground)" }}>Paid by</label>
            <div className="flex flex-wrap gap-2">
              {users.map(u => (
                <button key={u.id} type="button"
                  onClick={() => setPaidBy(u.id)}
                  className="px-3 py-1.5 text-xs font-semibold border transition-colors"
                  style={{
                    borderColor: paidBy === u.id ? "var(--color-foreground)" : "var(--color-border)",
                    background: paidBy === u.id ? "var(--color-primary)" : "transparent"
                  }}>
                  {u.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Split with */}
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase mb-1.5"
              style={{ color: "var(--color-muted-foreground)" }}>Split with</label>
            <div className="flex flex-wrap gap-2">
              {users.map(u => (
                <button key={u.id} type="button"
                  onClick={() => toggleSplit(u.id)}
                  className="px-3 py-1.5 text-xs font-semibold border transition-colors"
                  style={{
                    borderColor: splitWith.includes(u.id) ? "var(--color-foreground)" : "var(--color-border)",
                    background: splitWith.includes(u.id) ? "var(--color-foreground)" : "transparent",
                    color: splitWith.includes(u.id) ? "white" : "var(--color-foreground)"
                  }}>
                  {u.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm font-medium" style={{ color: "#e53e3e" }}>{error}</p>}

          <button type="submit"
            className="w-full bg-[var(--color-foreground)] text-white py-3 font-semibold
              text-sm tracking-widest uppercase hover:bg-[var(--color-primary)] hover:text-[var(--color-foreground)]
              transition-colors duration-150">
            Add expense
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Room Screen ──────────────────────────────────────────────────────────────

function RoomScreen({ currentUser, onLogout }: { currentUser: User; onLogout: () => void }) {
  const [expenses, setExpenses] = useState<Expense[]>(SEED_EXPENSES);
  const [users] = useState<User[]>(SEED_USERS);
  const [tab, setTab] = useState<"expenses" | "balances">("expenses");
  const [showAdd, setShowAdd] = useState(false);
  const [filterCat, setFilterCat] = useState<Category | "all">("all");

  const net = computeBalances(expenses, users);
  const myBalance = net[currentUser.id] ?? 0;

  const filtered = filterCat === "all"
    ? expenses
    : expenses.filter(e => e.category === filterCat);

  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);

  function addExpense(exp: Expense) {
    setExpenses(prev => [exp, ...prev]);
  }

  return (
    <div className="min-h-full flex flex-col max-w-lg mx-auto"
      style={{ background: "var(--color-background)" }}>

      {/* Header */}
      <header className="border-b-2 border-[var(--color-foreground)] bg-white px-5 py-4">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-2">
            <div className="bg-[var(--color-primary)] px-1.5 py-0.5">
              <span className="text-xs font-bold tracking-widest" style={{ fontFamily: "var(--font-mono)" }}>
                ROOMSPLIT
              </span>
            </div>
            <span className="text-xs font-mono" style={{ color: "var(--color-muted-foreground)", fontFamily: "var(--font-mono)" }}>
              #E5C8CU
            </span>
          </div>
          <button onClick={onLogout}
            className="text-xs font-semibold tracking-widest uppercase underline underline-offset-2
              hover:opacity-60 transition-opacity">
            Log out
          </button>
        </div>
        <h1 className="text-2xl font-bold mt-2" style={{ fontFamily: "var(--font-serif)" }}>
          Apartment 4B
        </h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted-foreground)" }}>
          Logged in as <strong>{currentUser.name}</strong>
        </p>
      </header>

      {/* My balance banner */}
      <div className="px-5 py-4 border-b border-[var(--color-border)]"
        style={{ background: myBalance >= 0 ? "#f0fdf4" : "#fff5f5" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase"
              style={{ color: "var(--color-muted-foreground)" }}>
              Your balance
            </p>
            <p className="text-3xl font-bold mt-0.5" style={{
              fontFamily: "var(--font-mono)",
              color: myBalance >= 0 ? "#16a34a" : "#e53e3e"
            }}>
              {myBalance >= 0 ? "+" : "–"}{fmt(myBalance)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold tracking-widest uppercase"
              style={{ color: "var(--color-muted-foreground)" }}>
              Total spent
            </p>
            <p className="text-xl font-bold mt-0.5" style={{ fontFamily: "var(--font-mono)" }}>
              {fmt(totalSpent)}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--color-border)] bg-white">
        {(["expenses", "balances"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-3 text-xs font-bold tracking-widest uppercase transition-colors"
            style={{
              borderBottom: tab === t ? "2px solid var(--color-foreground)" : "2px solid transparent",
              color: tab === t ? "var(--color-foreground)" : "var(--color-muted-foreground)",
              background: "white"
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "expenses" && (
          <div className="px-5 pb-24">
            {/* Category filter */}
            <div className="flex gap-2 overflow-x-auto py-4 -mx-5 px-5">
              <button
                onClick={() => setFilterCat("all")}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold border transition-colors"
                style={{
                  borderColor: filterCat === "all" ? "var(--color-foreground)" : "var(--color-border)",
                  background: filterCat === "all" ? "var(--color-foreground)" : "white",
                  color: filterCat === "all" ? "white" : "var(--color-foreground)"
                }}>
                All
              </button>
              {CATEGORIES.map(cat => (
                <button key={cat}
                  onClick={() => setFilterCat(cat)}
                  className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border transition-colors"
                  style={{
                    borderColor: filterCat === cat ? "var(--color-foreground)" : "var(--color-border)",
                    background: filterCat === cat ? "var(--color-primary)" : "white",
                    color: "var(--color-foreground)"
                  }}>
                  {CATEGORY_ICONS[cat]}
                  <span className="capitalize">{cat}</span>
                </button>
              ))}
            </div>

            {sorted.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-4xl mb-3">📋</p>
                <p className="font-medium" style={{ color: "var(--color-muted-foreground)" }}>No expenses yet</p>
              </div>
            ) : (
              sorted.map(exp => (
                <ExpenseRow key={exp.id} exp={exp} users={users} currentUser={currentUser} />
              ))
            )}
          </div>
        )}

        {tab === "balances" && (
          <div className="px-5 py-4 pb-24 space-y-3">
            <p className="text-xs font-semibold tracking-widest uppercase mb-4"
              style={{ color: "var(--color-muted-foreground)" }}>
              {users.length} members
            </p>
            {users.map(u => (
              <BalanceCard key={u.id} user={u} net={net} users={users} />
            ))}

            {/* Settlement suggestions */}
            <div className="mt-6">
              <p className="text-xs font-semibold tracking-widest uppercase mb-3"
                style={{ color: "var(--color-muted-foreground)" }}>
                Suggested settlements
              </p>
              {(() => {
                const debtors = users
                  .filter(u => net[u.id] < -0.01)
                  .sort((a, b) => net[a.id] - net[b.id]);
                const creditors = users
                  .filter(u => net[u.id] > 0.01)
                  .sort((a, b) => net[b.id] - net[a.id]);

                if (debtors.length === 0) {
                  return (
                    <div className="border border-[var(--color-primary)] bg-[#f9ffe6] px-4 py-3">
                      <p className="text-sm font-semibold">All settled up! 🎉</p>
                    </div>
                  );
                }

                return debtors.map(d =>
                  creditors.map(c => {
                    const amt = Math.min(Math.abs(net[d.id]), net[c.id]);
                    if (amt < 0.01) return null;
                    return (
                      <div key={`${d.id}-${c.id}`}
                        className="flex items-center justify-between border border-[var(--color-border)] bg-white px-4 py-3">
                        <p className="text-sm">
                          <strong>{d.name.split(" ")[0]}</strong>
                          <span style={{ color: "var(--color-muted-foreground)" }}> pays </span>
                          <strong>{c.name.split(" ")[0]}</strong>
                        </p>
                        <p className="font-bold text-sm" style={{ fontFamily: "var(--font-mono)", color: "#e53e3e" }}>
                          {fmt(amt)}
                        </p>
                      </div>
                    );
                  })
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* FAB */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-lg px-5">
        <button
          onClick={() => setShowAdd(true)}
          className="w-full py-4 font-bold text-sm tracking-widest uppercase
            bg-[var(--color-foreground)] text-white
            hover:bg-[var(--color-primary)] hover:text-[var(--color-foreground)]
            transition-colors duration-150 shadow-lg">
          + Add expense
        </button>
      </div>

      {showAdd && (
        <AddExpenseModal
          users={users}
          currentUser={currentUser}
          onAdd={addExpense}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("auth");
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  function handleLogin(user: User) {
    setCurrentUser(user);
    setScreen("room");
  }

  function handleLogout() {
    setCurrentUser(null);
    setScreen("auth");
  }

  if (screen === "auth") return <AuthScreen onLogin={handleLogin} />;
  return <RoomScreen currentUser={currentUser!} onLogout={handleLogout} />;
}
