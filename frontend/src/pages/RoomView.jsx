import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiRequest, formatMoney } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import {
  Building,
  Users,
  Copy,
  Check,
  Plus,
  Receipt,
  Scale,
  Calendar,
  Download,
  AlertTriangle,
  Trash2,
  CheckCircle,
  HelpCircle,
  Repeat,
  ArrowRight,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  UserX,
  FileSpreadsheet,
  Search,
  Filter,
  DollarSign,
  Tag,
} from 'lucide-react';

const DEFAULT_CATEGORIES = [
  'Rent',
  'Electricity',
  'Groceries',
  'Wifi',
  'Maid/Cook',
  'Mess',
  'Transport',
  'Subscription',
  'Misc',
];

function getCategoryBadgeClass(category) {
  if (!category) return 'badge-misc';
  const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `badge-${slug}`;
}

export default function RoomView({ roomCode, onBack }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'expenses' | 'balances' | 'members' | 'recurring'
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [splitTypes, setSplitTypes] = useState(['equal', 'custom', 'percentage', 'attendance']);

  // Core Data
  const [dashboard, setDashboard] = useState(null);
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [simplifiedDebts, setSimplifiedDebts] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [recurringList, setRecurringList] = useState([]);

  // Copied code feedback
  const [copiedCode, setCopiedCode] = useState(false);

  // Modals state
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [showAddRecurring, setShowAddRecurring] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);

  // Form states
  // Add Expense
  const [expAmount, setExpAmount] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expCategory, setExpCategory] = useState('Groceries');
  const [expPayer, setExpPayer] = useState('');
  const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);
  const [expSplitType, setExpSplitType] = useState('equal');
  const [customShares, setCustomShares] = useState({});
  const [percentages, setPercentages] = useState({});
  const [presentMembers, setPresentMembers] = useState([]);
  const [submittingExpense, setSubmittingExpense] = useState(false);

  // Settle Up
  const [settleFrom, setSettleFrom] = useState('');
  const [settleTo, setSettleTo] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState('upi');
  const [settleNote, setSettleNote] = useState('');
  const [submittingSettle, setSubmittingSettle] = useState(false);

  // Recurring
  const [recName, setRecName] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recCategory, setRecCategory] = useState('Rent');
  const [recPayer, setRecPayer] = useState('');
  const [recDay, setRecDay] = useState('1');
  const [submittingRec, setSubmittingRec] = useState(false);

  // Deposit
  const [depositTargetMember, setDepositTargetMember] = useState(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [submittingDeposit, setSubmittingDeposit] = useState(false);

  // Move out / Exit
  const [exitTargetMember, setExitTargetMember] = useState(null);
  const [exitResult, setExitResult] = useState(null);
  const [submittingExit, setSubmittingExit] = useState(false);

  // Dispute
  const [disputeTargetExp, setDisputeTargetExp] = useState(null);
  const [disputeNote, setDisputeNote] = useState('');

  // Filters for expenses
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Month for export
  const [exportMonth, setExportMonth] = useState(new Date().toISOString().slice(0, 7));

  // Fetch all room data
  const loadRoomData = useCallback(async () => {
    try {
      setLoading(true);
      const [dashData, mems, exps, bals, debts, sets, recs] = await Promise.all([
        apiRequest(`/api/rooms/${roomCode}/dashboard`),
        apiRequest(`/api/rooms/${roomCode}/members`),
        apiRequest(`/api/rooms/${roomCode}/expenses`),
        apiRequest(`/api/rooms/${roomCode}/balances`),
        apiRequest(`/api/rooms/${roomCode}/debts/simplify`, { method: 'POST' }),
        apiRequest(`/api/rooms/${roomCode}/settlements`),
        apiRequest(`/api/rooms/${roomCode}/recurring`),
      ]);

      setDashboard(dashData);
      setMembers(mems || []);
      setExpenses(exps || []);
      setBalances(bals || []);
      setSimplifiedDebts(debts || []);
      setSettlements(sets || []);
      setRecurringList(recs || []);

      // Defaults
      if (user) {
        setExpPayer(String(user.id));
        setRecPayer(String(user.id));
        setSettleFrom(String(user.id));
      }
    } catch (err) {
      showToast(err.message || 'Error loading room data', 'error');
    } finally {
      setLoading(false);
    }
  }, [roomCode, user, showToast]);

  useEffect(() => {
    loadRoomData();
  }, [loadRoomData]);

  // Fetch dynamic categories and split types
  useEffect(() => {
    apiRequest('/api/categories')
      .then((data) => {
        if (data && Array.isArray(data.categories) && data.categories.length > 0) {
          setCategories(data.categories);
        }
        if (data && Array.isArray(data.split_types) && data.split_types.length > 0) {
          setSplitTypes(data.split_types);
        }
      })
      .catch(() => {
        // Fall back gracefully to DEFAULT_CATEGORIES
      });
  }, []);

  // Active members
  const activeMembers = useMemo(() => {
    return members.filter((m) => m.status === 'active');
  }, [members]);

  const activeMemberIds = useMemo(() => {
    return activeMembers.map((m) => m.user_id);
  }, [activeMembers]);

  // Initialize present members when members change
  useEffect(() => {
    if (activeMemberIds.length > 0 && presentMembers.length === 0) {
      setPresentMembers(activeMemberIds);
    }
  }, [activeMemberIds, presentMembers.length]);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    showToast(`Room code ${roomCode} copied!`, 'info');
    setTimeout(() => setCopiedCode(false), 2200);
  };

  // -------------------------------------------------------------
  // Expense Actions
  // -------------------------------------------------------------
  const handleAddExpense = async (e) => {
    e.preventDefault();
    const amountVal = parseFloat(expAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    const payload = {
      amount: amountVal,
      description: expDesc.trim(),
      category: expCategory,
      paid_by: parseInt(expPayer, 10),
      expense_date: expDate,
      split_type: expSplitType,
    };

    if (expSplitType === 'equal') {
      payload.user_ids = activeMemberIds;
    } else if (expSplitType === 'custom') {
      const shares = {};
      let sum = 0;
      activeMembers.forEach((m) => {
        const val = parseFloat(customShares[m.user_id] || 0);
        shares[m.user_id] = val;
        sum += val;
      });
      if (Math.abs(sum - amountVal) > 0.05) {
        showToast(`Sum of shares (₹${sum.toFixed(2)}) must equal total (₹${amountVal.toFixed(2)})`, 'error');
        return;
      }
      payload.shares = shares;
    } else if (expSplitType === 'percentage') {
      const pct = {};
      let sum = 0;
      activeMembers.forEach((m) => {
        const val = parseFloat(percentages[m.user_id] || 0);
        pct[m.user_id] = val;
        sum += val;
      });
      if (Math.abs(sum - 100) > 0.5) {
        showToast(`Sum of percentages (${sum.toFixed(1)}%) must equal 100%`, 'error');
        return;
      }
      payload.percentages = pct;
    } else if (expSplitType === 'attendance') {
      if (presentMembers.length === 0) {
        showToast('At least one member must be present', 'error');
        return;
      }
      payload.present_user_ids = presentMembers;
    }

    try {
      setSubmittingExpense(true);
      await apiRequest(`/api/rooms/${roomCode}/expenses`, {
        method: 'POST',
        body: payload,
      });
      showToast('Expense added successfully!', 'success');
      setShowAddExpense(false);
      setExpAmount('');
      setExpDesc('');
      loadRoomData();
    } catch (err) {
      showToast(err.message || 'Error adding expense', 'error');
    } finally {
      setSubmittingExpense(false);
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    try {
      await apiRequest(`/api/rooms/${roomCode}/expenses/${expenseId}`, {
        method: 'DELETE',
      });
      showToast('Expense removed', 'info');
      loadRoomData();
    } catch (err) {
      showToast(err.message || 'Error deleting expense', 'error');
    }
  };

  const handleDispute = async (e) => {
    e.preventDefault();
    if (!disputeTargetExp) return;
    try {
      await apiRequest(`/api/rooms/${roomCode}/expenses/${disputeTargetExp.id}/dispute`, {
        method: 'POST',
        body: { note: disputeNote.trim() },
      });
      showToast('Expense marked as disputed', 'info');
      setShowDisputeModal(false);
      setDisputeTargetExp(null);
      setDisputeNote('');
      loadRoomData();
    } catch (err) {
      showToast(err.message || 'Error disputing expense', 'error');
    }
  };

  const handleResolveExpense = async (expenseId) => {
    try {
      await apiRequest(`/api/rooms/${roomCode}/expenses/${expenseId}/resolve`, {
        method: 'POST',
      });
      showToast('Expense marked as resolved', 'success');
      loadRoomData();
    } catch (err) {
      showToast(err.message || 'Error resolving expense', 'error');
    }
  };

  // -------------------------------------------------------------
  // Settlement Actions
  // -------------------------------------------------------------
  const handleSettleUp = async (e) => {
    e.preventDefault();
    const amountVal = parseFloat(settleAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      showToast('Please enter a valid payment amount', 'error');
      return;
    }
    if (settleFrom === settleTo) {
      showToast('Payer and payee must be different people', 'error');
      return;
    }

    try {
      setSubmittingSettle(true);
      await apiRequest(`/api/rooms/${roomCode}/settlements`, {
        method: 'POST',
        body: {
          from_user: parseInt(settleFrom, 10),
          to_user: parseInt(settleTo, 10),
          amount: amountVal,
          method: settleMethod,
          note: settleNote.trim(),
        },
      });
      showToast('Settlement payment recorded!', 'success');
      setShowSettleModal(false);
      setSettleAmount('');
      setSettleNote('');
      loadRoomData();
    } catch (err) {
      showToast(err.message || 'Error recording settlement', 'error');
    } finally {
      setSubmittingSettle(false);
    }
  };

  const prefillSettlement = (fromId, toId, amount) => {
    setSettleFrom(String(fromId));
    setSettleTo(String(toId));
    setSettleAmount(String(amount));
    setShowSettleModal(true);
  };

  // -------------------------------------------------------------
  // Recurring Actions
  // -------------------------------------------------------------
  const handleAddRecurring = async (e) => {
    e.preventDefault();
    const amountVal = parseFloat(recAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      showToast('Please enter a valid bill amount', 'error');
      return;
    }

    try {
      setSubmittingRec(true);
      await apiRequest(`/api/rooms/${roomCode}/recurring`, {
        method: 'POST',
        body: {
          name: recName.trim(),
          amount: amountVal,
          category: recCategory,
          paid_by: parseInt(recPayer, 10),
          day_of_month: parseInt(recDay, 10),
          split_type: 'equal',
        },
      });
      showToast('Recurring bill added!', 'success');
      setShowAddRecurring(false);
      setRecName('');
      setRecAmount('');
      loadRoomData();
    } catch (err) {
      showToast(err.message || 'Error adding recurring bill', 'error');
    } finally {
      setSubmittingRec(false);
    }
  };

  const handleToggleRecurring = async (recId, currentActive) => {
    try {
      await apiRequest(`/api/rooms/${roomCode}/recurring/${recId}`, {
        method: 'PUT',
        body: { active: !currentActive },
      });
      showToast(!currentActive ? 'Recurring bill activated' : 'Recurring bill paused', 'info');
      loadRoomData();
    } catch (err) {
      showToast(err.message || 'Error updating recurring bill', 'error');
    }
  };

  const handleGenerateRecurring = async (recId) => {
    try {
      await apiRequest(`/api/rooms/${roomCode}/recurring/${recId}/generate`, {
        method: 'POST',
      });
      showToast("Generated this month's expense!", 'success');
      loadRoomData();
    } catch (err) {
      showToast(err.message || 'Already generated or error occurred', 'error');
    }
  };

  // -------------------------------------------------------------
  // Members: Deposit & Move-out
  // -------------------------------------------------------------
  const handleSetDeposit = async (e) => {
    e.preventDefault();
    if (!depositTargetMember) return;
    const val = parseFloat(depositAmount);
    if (isNaN(val) || val < 0) {
      showToast('Enter a valid non-negative deposit amount', 'error');
      return;
    }
    try {
      setSubmittingDeposit(true);
      await apiRequest(`/api/rooms/${roomCode}/members/${depositTargetMember.user_id}/deposit`, {
        method: 'PUT',
        body: { deposit: val },
      });
      showToast(`Updated security deposit for ${depositTargetMember.user.name}`, 'success');
      setShowDepositModal(false);
      setDepositTargetMember(null);
      loadRoomData();
    } catch (err) {
      showToast(err.message || 'Error updating deposit', 'error');
    } finally {
      setSubmittingDeposit(false);
    }
  };

  const handleExitMember = async () => {
    if (!exitTargetMember) return;
    try {
      setSubmittingExit(true);
      const res = await apiRequest(`/api/rooms/${roomCode}/members/${exitTargetMember.user_id}/exit`, {
        method: 'POST',
      });
      setExitResult(res);
      showToast(`${exitTargetMember.user.name} moved out of the room`, 'info');
      loadRoomData();
    } catch (err) {
      showToast(err.message || 'Error executing move out', 'error');
    } finally {
      setSubmittingExit(false);
    }
  };

  // -------------------------------------------------------------
  // Export CSV
  // -------------------------------------------------------------
  const handleExportCSV = async () => {
    try {
      const blob = await apiRequest(`/api/rooms/${roomCode}/reports/monthly.csv?month=${exportMonth}`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kitty_${roomCode}_${exportMonth}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast(`Downloaded CSV for ${exportMonth}`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to download CSV', 'error');
    }
  };

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchesSearch =
        searchQuery === '' ||
        e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = categoryFilter === 'all' || e.category === categoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [expenses, searchQuery, categoryFilter]);

  if (loading && !dashboard) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '1.2rem', marginBottom: '10px' }}>Loading room data...</div>
      </div>
    );
  }

  const room = dashboard?.room;
  const myBalance = dashboard?.my_balance_minor || 0;

  return (
    <div>
      {/* Room Header Banner */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, rgba(22,32,50,0.9) 0%, rgba(17,24,39,0.95) 100%)',
          marginBottom: '24px',
          padding: '24px 28px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '18px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                {room?.name}
              </h2>
              {/* Room Code Badge */}
              <button
                type="button"
                className="btn btn-secondary btn-sm mono"
                onClick={copyRoomCode}
                title="Copy Room Code to share with flatmates"
                style={{
                  background: 'var(--bg-card)',
                  borderColor: 'var(--border-card)',
                  fontSize: '0.85rem',
                  padding: '5px 10px',
                }}
              >
                {copiedCode ? <Check size={14} color="var(--emerald)" /> : <Copy size={14} />}
                <span>{roomCode}</span>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Users size={15} /> {activeMembers.length} active flatmates
              </span>
              <span>•</span>
              <span>Month Spend: <strong className="mono" style={{ color: 'var(--text-main)' }}>{formatMoney(dashboard?.month_total_minor)}</strong></span>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowAddExpense(true)}
            >
              <Plus size={16} /> Add Expense
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowSettleModal(true)}
            >
              <Scale size={16} /> Settle Up
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="tabs-nav">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <TrendingUp size={16} /> Overview
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'expenses' ? 'active' : ''}`}
          onClick={() => setActiveTab('expenses')}
        >
          <Receipt size={16} /> Expenses ({expenses.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'balances' ? 'active' : ''}`}
          onClick={() => setActiveTab('balances')}
        >
          <Scale size={16} /> Balances & Debts ({simplifiedDebts.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'members' ? 'active' : ''}`}
          onClick={() => setActiveTab('members')}
        >
          <Users size={16} /> Members ({members.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'recurring' ? 'active' : ''}`}
          onClick={() => setActiveTab('recurring')}
        >
          <Repeat size={16} /> Recurring Bills ({recurringList.length})
        </button>
      </div>

      {/* =========================================================================
          TAB 1: OVERVIEW / DASHBOARD
         ========================================================================= */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* Net Balance Status Banner */}
          <div
            className="card"
            style={{
              background:
                myBalance > 0
                  ? 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(22,32,50,0.6) 100%)'
                  : myBalance < 0
                  ? 'linear-gradient(135deg, rgba(244,63,94,0.12) 0%, rgba(22,32,50,0.6) 100%)'
                  : 'var(--bg-card)',
              borderColor:
                myBalance > 0
                  ? 'rgba(16,185,129,0.3)'
                  : myBalance < 0
                  ? 'rgba(244,63,94,0.3)'
                  : 'var(--border-card)',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  Your Room Balance
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                  <h3
                    className="mono"
                    style={{
                      fontSize: '2.2rem',
                      fontWeight: 800,
                      margin: 0,
                      color:
                        myBalance > 0
                          ? 'var(--emerald-ink)'
                          : myBalance < 0
                          ? 'var(--coral-ink)'
                          : 'var(--text-main)',
                    }}
                  >
                    {myBalance > 0
                      ? `+${formatMoney(myBalance)}`
                      : myBalance < 0
                      ? `-${formatMoney(Math.abs(myBalance))}`
                      : '₹0.00'}
                  </h3>
                  {myBalance > 0 && <span className="badge badge-positive">You get back</span>}
                  {myBalance < 0 && <span className="badge badge-negative">You owe</span>}
                  {myBalance === 0 && <span className="badge badge-misc">All settled up</span>}
                </div>
              </div>

              {myBalance !== 0 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowSettleModal(true)}
                >
                  <Scale size={16} /> Settle Up Now
                </button>
              )}
            </div>
          </div>

          {/* Pending Recurring Bills Alert (if any) */}
          {dashboard?.pending_recurring && dashboard.pending_recurring.length > 0 && (
            <div
              className="card"
              style={{
                background: 'rgba(245, 158, 11, 0.08)',
                borderColor: 'rgba(245, 158, 11, 0.3)',
                padding: '18px 22px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(245, 158, 11, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--amber-ink)',
                    }}
                  >
                    <Repeat size={18} />
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--text-main)' }}>
                      {dashboard.pending_recurring.length} Recurring Bill(s) Due This Month
                    </strong>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {dashboard.pending_recurring.map((r) => r.name).join(', ')}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setActiveTab('recurring')}
                >
                  View & Generate <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Metric Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '18px',
            }}
          >
            {/* Top Categories Card */}
            <div className="card">
              <h4 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700 }}>
                Category Breakdown (This Month)
              </h4>
              {dashboard?.top_categories && dashboard.top_categories.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {dashboard.top_categories.map((cat) => {
                    const pct =
                      dashboard.month_total_minor > 0
                        ? Math.round((cat.amount_minor / dashboard.month_total_minor) * 100)
                        : 0;
                    return (
                      <div key={cat.category}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '5px' }}>
                          <span style={{ fontWeight: 600 }}>{cat.category}</span>
                          <span className="mono" style={{ color: 'var(--text-muted)' }}>
                            {formatMoney(cat.amount_minor)} ({pct}%)
                          </span>
                        </div>
                        <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${pct}%`,
                              background: 'var(--emerald)',
                              borderRadius: '3px',
                            }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: 'var(--text-dim)', fontSize: '0.88rem', padding: '20px 0', textAlign: 'center' }}>
                  No expenses recorded this month yet.
                </div>
              )}
            </div>

            {/* Quick Settle / Debt Summary Card */}
            <div className="card">
              <div className="card-header-flex">
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                  Simplified Debts
                </h4>
                <button
                  type="button"
                  className="btn btn-subtle btn-sm"
                  onClick={() => setActiveTab('balances')}
                >
                  View All ({simplifiedDebts.length})
                </button>
              </div>

              {simplifiedDebts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-dim)', fontSize: '0.88rem' }}>
                  <CheckCircle size={24} color="var(--emerald)" style={{ margin: '0 auto 8px' }} />
                  Everyone is completely settled up!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {simplifiedDebts.slice(0, 4).map((debt, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '0.86rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600 }}>{debt.from_name}</span>
                        <ArrowRight size={13} style={{ color: 'var(--text-dim)' }} />
                        <span style={{ fontWeight: 600 }}>{debt.to_name}</span>
                      </div>
                      <span className="mono" style={{ fontWeight: 700, color: 'var(--emerald-ink)' }}>
                        {formatMoney(debt.amount_minor)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Expenses Preview */}
          <div className="card">
            <div className="card-header-flex">
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                Recent Expenses
              </h4>
              <button
                type="button"
                className="btn btn-subtle btn-sm"
                onClick={() => setActiveTab('expenses')}
              >
                View all ({expenses.length})
              </button>
            </div>

            {expenses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-dim)', fontSize: '0.88rem' }}>
                No expenses logged yet. Tap "Add Expense" to start!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {expenses.slice(0, 5).map((e) => (
                  <div
                    key={e.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className={`badge ${getCategoryBadgeClass(e.category)}`}>
                        {e.category}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                          {e.description || e.category}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          Paid by {e.payer?.name || 'Someone'} • {new Date(e.expense_date).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="mono" style={{ fontWeight: 700, fontSize: '1rem' }}>
                      {formatMoney(e.amount_minor)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: EXPENSES LIST & SEARCH
         ========================================================================= */}
      {activeTab === 'expenses' && (
        <div>
          {/* Filter Bar */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '260px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search expenses by description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: '34px' }}
                />
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-dim)',
                  }}
                />
              </div>

              <select
                className="form-control"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ width: '160px' }}
              >
                <option value="all">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowAddExpense(true)}
            >
              <Plus size={16} /> New Expense
            </button>
          </div>

          {/* Expense Cards */}
          {filteredExpenses.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)' }}>
              No expenses matching your criteria.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredExpenses.map((exp) => (
                <div
                  key={exp.id}
                  className="card"
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span className={`badge ${getCategoryBadgeClass(exp.category)}`}>
                      {exp.category}
                    </span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700 }}>
                          {exp.description || exp.category}
                        </h4>
                        {exp.status === 'disputed' && (
                          <span className="badge badge-negative">Disputed</span>
                        )}
                        {exp.status === 'resolved' && (
                          <span className="badge badge-positive">Resolved</span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Paid by <strong>{exp.payer?.name}</strong> • Split ({exp.split_type}) • {exp.expense_date}
                      </div>
                      {exp.dispute_note && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--coral-ink)', marginTop: '3px' }}>
                          Note: {exp.dispute_note}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                      {formatMoney(exp.amount_minor)}
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      {exp.status === 'active' && (
                        <button
                          type="button"
                          className="btn btn-subtle btn-sm"
                          style={{ padding: '6px 8px', color: 'var(--amber-ink)' }}
                          onClick={() => {
                            setDisputeTargetExp(exp);
                            setShowDisputeModal(true);
                          }}
                          title="Dispute expense"
                        >
                          <AlertTriangle size={15} />
                        </button>
                      )}

                      {exp.status === 'disputed' && (
                        <button
                          type="button"
                          className="btn btn-subtle btn-sm"
                          style={{ padding: '6px 8px', color: 'var(--emerald-ink)' }}
                          onClick={() => handleResolveExpense(exp.id)}
                          title="Resolve dispute"
                        >
                          <Check size={15} /> Resolve
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn btn-subtle btn-sm"
                        style={{ padding: '6px 8px', color: 'var(--coral-ink)' }}
                        onClick={() => handleDeleteExpense(exp.id)}
                        title="Delete expense"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: BALANCES & SIMPLIFIED DEBTS
         ========================================================================= */}
      {activeTab === 'balances' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Member Net Balances */}
          <div className="card">
            <h4 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700 }}>
              Member Net Ledger
            </h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '12px',
              }}
            >
              {balances.map((b) => (
                <div
                  key={b.user_id}
                  style={{
                    padding: '14px 18px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.94rem' }}>{b.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      {b.balance_minor > 0
                        ? 'Owed by flatmates'
                        : b.balance_minor < 0
                        ? 'Owes the flat'
                        : 'Settled'}
                    </div>
                  </div>
                  <span
                    className="mono"
                    style={{
                      fontSize: '1.15rem',
                      fontWeight: 800,
                      color:
                        b.balance_minor > 0
                          ? 'var(--emerald-ink)'
                          : b.balance_minor < 0
                          ? 'var(--coral-ink)'
                          : 'var(--text-dim)',
                    }}
                  >
                    {b.balance_minor > 0 ? `+${formatMoney(b.balance_minor)}` : formatMoney(b.balance_minor)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Simplified Debt Transactions */}
          <div className="card">
            <div className="card-header-flex">
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 700 }}>
                  Simplified Settlement Plan
                </h4>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                  Mathematically calculated minimum payment routes to settle all room debts.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowSettleModal(true)}
              >
                <Plus size={14} /> Record Payment
              </button>
            </div>

            {simplifiedDebts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-dim)' }}>
                <CheckCircle size={28} color="var(--emerald)" style={{ margin: '0 auto 10px' }} />
                All room accounts are balanced. Zero pending debts!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {simplifiedDebts.map((debt, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '16px 20px',
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--emerald-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--emerald-ink)',
                        }}
                      >
                        <Scale size={18} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.98rem', fontWeight: 700 }}>
                          <span style={{ color: 'var(--coral-ink)' }}>{debt.from_name}</span> pays{' '}
                          <span style={{ color: 'var(--emerald-ink)' }}>{debt.to_name}</span>
                        </div>
                        <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 800, marginTop: '2px' }}>
                          {formatMoney(debt.amount_minor)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {debt.upi_link && (
                        <a
                          href={debt.upi_link}
                          className="btn btn-secondary btn-sm"
                          style={{
                            color: 'var(--emerald-ink)',
                            borderColor: 'rgba(16,185,129,0.3)',
                          }}
                        >
                          <CreditCard size={14} /> Pay via UPI
                        </a>
                      )}
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => prefillSettlement(debt.from_user, debt.to_user, debt.amount)}
                      >
                        Record Settlement
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Settlement History */}
          <div className="card">
            <h4 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700 }}>
              Settlement History
            </h4>
            {settlements.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-dim)', fontSize: '0.88rem' }}>
                No recorded settlements yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {settlements.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.88rem',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {s.payer?.name} paid {s.payee?.name} via{' '}
                        <span style={{ textTransform: 'uppercase', color: 'var(--indigo-ink)' }}>
                          {s.method}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {new Date(s.created_at).toLocaleDateString()} {s.note ? `• "${s.note}"` : ''}
                      </div>
                    </div>
                    <span className="mono" style={{ fontWeight: 700, color: 'var(--emerald-ink)' }}>
                      {formatMoney(s.amount_minor)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: MEMBERS & DEPOSITS
         ========================================================================= */}
      {activeTab === 'members' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card">
            <div className="card-header-flex">
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 700 }}>
                  Room Members
                </h4>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                  Active flatmates, roles, UPI handles, and security deposits.
                </div>
              </div>

              {/* Monthly CSV export control */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="month"
                  className="form-control"
                  style={{ width: '150px', padding: '6px 10px', fontSize: '0.82rem' }}
                  value={exportMonth}
                  onChange={(e) => setExportMonth(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleExportCSV}
                >
                  <FileSpreadsheet size={15} /> Export CSV
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {members.map((m) => {
                const isCaller = user && m.user_id === user.id;
                const callerIsOwner = activeMembers.some((am) => am.user_id === user?.id && am.role === 'owner');

                return (
                  <div
                    key={m.id}
                    style={{
                      padding: '16px 20px',
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: 'var(--radius-full)',
                          background: m.role === 'owner' ? 'var(--emerald)' : 'var(--indigo)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '1rem',
                        }}
                      >
                        {m.user?.name ? m.user.name[0].toUpperCase() : 'U'}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                            {m.user?.name}
                          </h4>
                          <span className={`badge ${m.role === 'owner' ? 'badge-rent' : 'badge-misc'}`}>
                            {m.role}
                          </span>
                          {m.status === 'exited' && (
                            <span className="badge badge-negative">Exited</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          +91 {m.user?.phone} {m.user?.upi_id ? `• UPI: ${m.user.upi_id}` : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Deposit</div>
                        <div className="mono" style={{ fontWeight: 700 }}>
                          {formatMoney(m.deposit_minor || 0)}
                        </div>
                      </div>

                      {/* Deposit Edit */}
                      {(isCaller || callerIsOwner) && m.status === 'active' && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setDepositTargetMember(m);
                            setDepositAmount(String((m.deposit_minor || 0) / 100));
                            setShowDepositModal(true);
                          }}
                        >
                          Edit Deposit
                        </button>
                      )}

                      {/* Move Out / Exit */}
                      {(isCaller || callerIsOwner) && m.status === 'active' && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => {
                            setExitTargetMember(m);
                            setExitResult(null);
                            setShowExitModal(true);
                          }}
                        >
                          <UserX size={14} /> Move Out
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: RECURRING EXPENSES
         ========================================================================= */}
      {activeTab === 'recurring' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card">
            <div className="card-header-flex">
              <div>
                <h4 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 700 }}>
                  Recurring Bills
                </h4>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                  Templates for fixed monthly expenses like Rent, Wifi, Maid, and Maintenance.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowAddRecurring(true)}
              >
                <Plus size={14} /> Add Recurring Bill
              </button>
            </div>

            {recurringList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-dim)', fontSize: '0.88rem' }}>
                No recurring bills configured yet. Add your rent or wifi template!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {recurringList.map((rec) => (
                  <div
                    key={rec.id}
                    style={{
                      padding: '16px 20px',
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <span className={`badge ${getCategoryBadgeClass(rec.category)}`}>
                        {rec.category}
                      </span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>
                          {rec.name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Due on day {rec.day_of_month} of each month • Last generated: {rec.last_generated_month || 'Never'}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div className="mono" style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                        {formatMoney(rec.amount_minor)}
                      </div>

                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleGenerateRecurring(rec.id)}
                      >
                        Generate This Month
                      </button>

                      <button
                        type="button"
                        className={`btn btn-sm ${rec.active ? 'btn-secondary' : 'btn-subtle'}`}
                        onClick={() => handleToggleRecurring(rec.id, rec.active)}
                      >
                        {rec.active ? 'Active' : 'Paused'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODALS
         ========================================================================= */}

      {/* Modal: Add Expense */}
      <Modal
        isOpen={showAddExpense}
        onClose={() => setShowAddExpense(false)}
        title="Add Room Expense"
        maxWidth="580px"
      >
        <form onSubmit={handleAddExpense}>
          <div className="form-group">
            <label htmlFor="exp-amount">Amount (INR)</label>
            <div className="input-money-wrap">
              <span className="input-currency-symbol">₹</span>
              <input
                id="exp-amount"
                type="number"
                step="0.01"
                min="0.01"
                className="form-control"
                placeholder="0.00"
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                required
                autoFocus
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="exp-desc">Description</label>
            <input
              id="exp-desc"
              type="text"
              className="form-control"
              placeholder="e.g. BigBasket Groceries, Water Jar, Electricity"
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label htmlFor="exp-cat">Category</label>
              <select
                id="exp-cat"
                className="form-control"
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="exp-payer">Paid By</label>
              <select
                id="exp-payer"
                className="form-control"
                value={expPayer}
                onChange={(e) => setExpPayer(e.target.value)}
              >
                {activeMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user?.name} {user && m.user_id === user.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="exp-date">Expense Date</label>
            <input
              id="exp-date"
              type="date"
              className="form-control"
              value={expDate}
              onChange={(e) => setExpDate(e.target.value)}
              required
            />
          </div>

          {/* Split Type Selector */}
          <div className="form-group">
            <label>Split Type</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-sm)',
                padding: '3px',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {splitTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`tab-btn ${expSplitType === type ? 'active' : ''}`}
                  style={{
                    justifyContent: 'center',
                    padding: '7px 4px',
                    fontSize: '0.8rem',
                    textTransform: 'capitalize',
                  }}
                  onClick={() => setExpSplitType(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Shares Inputs */}
          {expSplitType === 'custom' && (
            <div style={{ marginBottom: '18px', padding: '12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                Specify exact share amount for each flatmate:
              </div>
              {activeMembers.map((m) => (
                <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.88rem' }}>{m.user?.name}</span>
                  <div style={{ width: '130px' }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-control mono"
                      placeholder="0.00"
                      value={customShares[m.user_id] || ''}
                      onChange={(e) => setCustomShares({ ...customShares, [m.user_id]: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Percentage Inputs */}
          {expSplitType === 'percentage' && (
            <div style={{ marginBottom: '18px', padding: '12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                Specify percentage for each flatmate (Total must equal 100%):
              </div>
              {activeMembers.map((m) => (
                <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.88rem' }}>{m.user?.name}</span>
                  <div style={{ width: '130px' }}>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      className="form-control mono"
                      placeholder="0.0%"
                      value={percentages[m.user_id] || ''}
                      onChange={(e) => setPercentages({ ...percentages, [m.user_id]: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Attendance Checkboxes */}
          {expSplitType === 'attendance' && (
            <div style={{ marginBottom: '18px', padding: '12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                Select flatmates present for this expense:
              </div>
              {activeMembers.map((m) => {
                const checked = presentMembers.includes(m.user_id);
                return (
                  <label key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setPresentMembers([...presentMembers, m.user_id]);
                        } else {
                          setPresentMembers(presentMembers.filter((id) => id !== m.user_id));
                        }
                      }}
                    />
                    <span style={{ fontSize: '0.88rem' }}>{m.user?.name}</span>
                  </label>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddExpense(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submittingExpense}>
              {submittingExpense ? 'Saving...' : 'Add Expense'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Settle Up */}
      <Modal
        isOpen={showSettleModal}
        onClose={() => setShowSettleModal(false)}
        title="Record Settle Up Payment"
      >
        <form onSubmit={handleSettleUp}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label htmlFor="settle-from">Who Paid (Debtor)</label>
              <select
                id="settle-from"
                className="form-control"
                value={settleFrom}
                onChange={(e) => setSettleFrom(e.target.value)}
              >
                {activeMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user?.name} {user && m.user_id === user.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="settle-to">Who Received (Creditor)</label>
              <select
                id="settle-to"
                className="form-control"
                value={settleTo}
                onChange={(e) => setSettleTo(e.target.value)}
              >
                {activeMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user?.name} {user && m.user_id === user.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="settle-amount">Amount (INR)</label>
            <div className="input-money-wrap">
              <span className="input-currency-symbol">₹</span>
              <input
                id="settle-amount"
                type="number"
                step="0.01"
                min="0.01"
                className="form-control"
                placeholder="0.00"
                value={settleAmount}
                onChange={(e) => setSettleAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="settle-method">Payment Method</label>
            <select
              id="settle-method"
              className="form-control"
              value={settleMethod}
              onChange={(e) => setSettleMethod(e.target.value)}
            >
              <option value="upi">UPI / GPay / PhonePe</option>
              <option value="cash">Cash in hand</option>
              <option value="bank">Bank Transfer (IMPS/NEFT)</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="settle-note">Note (Optional)</label>
            <input
              id="settle-note"
              type="text"
              className="form-control"
              placeholder="e.g. Paid August dues"
              value={settleNote}
              onChange={(e) => setSettleNote(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowSettleModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submittingSettle}>
              {submittingSettle ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add Recurring Bill */}
      <Modal
        isOpen={showAddRecurring}
        onClose={() => setShowAddRecurring(false)}
        title="Add Recurring Bill Template"
      >
        <form onSubmit={handleAddRecurring}>
          <div className="form-group">
            <label htmlFor="rec-name">Bill Title</label>
            <input
              id="rec-name"
              type="text"
              className="form-control"
              placeholder="e.g. Flat Rent, Airtel Broadband, Cook Salary"
              value={recName}
              onChange={(e) => setRecName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label htmlFor="rec-amount">Amount (INR)</label>
              <div className="input-money-wrap">
                <span className="input-currency-symbol">₹</span>
                <input
                  id="rec-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-control"
                  placeholder="0.00"
                  value={recAmount}
                  onChange={(e) => setRecAmount(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="rec-day">Day of Month Due</label>
              <input
                id="rec-day"
                type="number"
                min="1"
                max="31"
                className="form-control"
                value={recDay}
                onChange={(e) => setRecDay(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label htmlFor="rec-cat">Category</label>
              <select
                id="rec-cat"
                className="form-control"
                value={recCategory}
                onChange={(e) => setRecCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="rec-payer">Default Payer</label>
              <select
                id="rec-payer"
                className="form-control"
                value={recPayer}
                onChange={(e) => setRecPayer(e.target.value)}
              >
                {activeMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user?.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddRecurring(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submittingRec}>
              {submittingRec ? 'Adding...' : 'Add Template'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Deposit */}
      <Modal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        title={`Set Deposit for ${depositTargetMember?.user?.name}`}
      >
        <form onSubmit={handleSetDeposit}>
          <div className="form-group">
            <label htmlFor="dep-amount">Security Deposit (INR)</label>
            <div className="input-money-wrap">
              <span className="input-currency-symbol">₹</span>
              <input
                id="dep-amount"
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-hint">
              This amount will be credited back to the member upon moving out.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowDepositModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submittingDeposit}>
              {submittingDeposit ? 'Updating...' : 'Save Deposit'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Move Out / Exit */}
      <Modal
        isOpen={showExitModal}
        onClose={() => {
          setShowExitModal(false);
          setExitResult(null);
        }}
        title={`Move Out: ${exitTargetMember?.user?.name}`}
      >
        {exitResult ? (
          <div>
            <div
              style={{
                padding: '16px',
                background: 'rgba(16,185,129,0.1)',
                border: '1px solid rgba(16,185,129,0.3)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '18px',
              }}
            >
              <h4 style={{ margin: '0 0 8px', color: 'var(--emerald-ink)' }}>
                Move Out Finalized
              </h4>
              <div style={{ fontSize: '0.88rem', marginBottom: '8px' }}>
                Net Balance: <strong className="mono">{formatMoney(exitResult.net_balance_minor)}</strong>
              </div>
              <div style={{ fontSize: '0.88rem', marginBottom: '8px' }}>
                Deposit Refund: <strong className="mono">{formatMoney(exitResult.deposit_minor)}</strong>
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                Final Settlement: <strong className="mono" style={{ color: 'var(--emerald-ink)' }}>{formatMoney(exitResult.final_settlement_minor)}</strong>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                {exitResult.note}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => {
                setShowExitModal(false);
                setExitResult(null);
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
              Moving out freezes historical transactions for <strong>{exitTargetMember?.user?.name}</strong>.
              Their security deposit will be automatically computed alongside their net debt to give an exact final payout.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowExitModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleExitMember}
                disabled={submittingExit}
              >
                {submittingExit ? 'Processing...' : 'Confirm Move Out'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Dispute Expense */}
      <Modal
        isOpen={showDisputeModal}
        onClose={() => setShowDisputeModal(false)}
        title="Dispute Expense"
      >
        <form onSubmit={handleDispute}>
          <div className="form-group">
            <label htmlFor="dispute-reason">Reason for Dispute</label>
            <textarea
              id="dispute-reason"
              className="form-control"
              rows={4}
              placeholder="e.g. I was not home on this day / amount looks incorrect"
              value={disputeNote}
              onChange={(e) => setDisputeNote(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowDisputeModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-danger">
              Mark as Disputed
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
