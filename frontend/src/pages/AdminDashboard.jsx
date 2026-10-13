import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest, formatMoney } from '../api';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import {
  Shield,
  ShieldCheck,
  Users,
  Building,
  TrendingUp,
  CreditCard,
  Search,
  Trash2,
  RefreshCw,
  ArrowLeft,
  LogOut,
  KeyRound,
  Calendar,
  Phone,
  Tag,
  CheckCircle,
  AlertTriangle,
  Receipt,
  Layers,
  ArrowRight,
} from 'lucide-react';

export default function AdminDashboard({ onBack, onSelectRoom }) {
  const { showToast } = useToast();

  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [adminKey, setAdminKey] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Active view tab in admin: 'overview' | 'users' | 'rooms'
  const [activeTab, setActiveTab] = useState('overview');

  // Core Data
  const [stats, setStats] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [roomsList, setRoomsList] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  // Search queries
  const [userSearch, setUserSearch] = useState('');
  const [roomSearch, setRoomSearch] = useState('');

  // Modals for deletion
  const [deleteTargetUser, setDeleteTargetUser] = useState(null);
  const [deleteTargetRoom, setDeleteTargetRoom] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Check if admin session is already active
  const checkAdminStatus = useCallback(async () => {
    try {
      setCheckingAuth(true);
      const res = await apiRequest('/api/admin/verify');
      setIsAdmin(Boolean(res?.is_admin));
    } catch {
      setIsAdmin(false);
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    checkAdminStatus();
  }, [checkAdminStatus]);

  // Fetch admin stats, users, rooms
  const loadAdminData = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setLoadingData(true);
      const [statsData, usersData, roomsData] = await Promise.all([
        apiRequest('/api/admin/stats'),
        apiRequest('/api/admin/users'),
        apiRequest('/api/admin/rooms'),
      ]);
      setStats(statsData);
      setUsersList(Array.isArray(usersData) ? usersData : []);
      setRoomsList(Array.isArray(roomsData) ? roomsData : []);
    } catch (err) {
      showToast(err.message || 'Error loading admin data', 'error');
    } finally {
      setLoadingData(false);
    }
  }, [isAdmin, showToast]);

  useEffect(() => {
    if (isAdmin) {
      loadAdminData();
    }
  }, [isAdmin, loadAdminData]);

  // Handle Admin Passkey Login
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    if (!adminKey.trim()) {
      showToast('Please enter the admin passkey', 'error');
      return;
    }
    try {
      setLoggingIn(true);
      await apiRequest('/api/admin/login', {
        method: 'POST',
        body: { admin_key: adminKey.trim() },
      });
      setIsAdmin(true);
      setAdminKey('');
      showToast('Superadmin access granted!', 'success');
    } catch (err) {
      showToast(err.message || 'Invalid admin passkey', 'error');
    } finally {
      setLoggingIn(false);
    }
  };

  // Handle Admin Logout
  const handleAdminLogout = async () => {
    try {
      await apiRequest('/api/admin/logout', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      setIsAdmin(false);
      showToast('Admin session locked', 'info');
    }
  };

  // Delete User
  const confirmDeleteUser = async () => {
    if (!deleteTargetUser) return;
    try {
      setActionLoading(true);
      await apiRequest(`/api/admin/users/${deleteTargetUser.id}`, { method: 'DELETE' });
      showToast(`User ${deleteTargetUser.name} deleted`, 'success');
      setDeleteTargetUser(null);
      loadAdminData();
    } catch (err) {
      showToast(err.message || 'Failed to delete user', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Room
  const confirmDeleteRoom = async () => {
    if (!deleteTargetRoom) return;
    try {
      setActionLoading(true);
      await apiRequest(`/api/admin/rooms/${deleteTargetRoom.id}`, { method: 'DELETE' });
      showToast(`Room ${deleteTargetRoom.name} (${deleteTargetRoom.code}) deleted`, 'success');
      setDeleteTargetRoom(null);
      loadAdminData();
    } catch (err) {
      showToast(err.message || 'Failed to delete room', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered users
  const filteredUsers = usersList.filter((u) => {
    if (!userSearch.trim()) return true;
    const term = userSearch.toLowerCase();
    return (
      u.name?.toLowerCase().includes(term) ||
      u.phone?.includes(term) ||
      String(u.id).includes(term)
    );
  });

  // Filtered rooms
  const filteredRooms = roomsList.filter((r) => {
    if (!roomSearch.trim()) return true;
    const term = roomSearch.toLowerCase();
    return (
      r.name?.toLowerCase().includes(term) ||
      r.code?.toLowerCase().includes(term) ||
      r.creator_name?.toLowerCase().includes(term)
    );
  });

  // 1. Loading State
  if (checkingAuth) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px', color: 'var(--text-muted)' }}>
        <Shield size={36} style={{ animation: 'pulse 1.5s infinite', color: 'var(--indigo-ink)' }} />
        <p style={{ marginTop: '14px', fontWeight: 600 }}>Verifying admin credentials...</p>
      </div>
    );
  }

  // 2. Unauthenticated Admin Login Screen
  if (!isAdmin) {
    return (
      <div
        style={{
          minHeight: 'calc(100vh - 120px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
        }}
      >
        <div
          className="card"
          style={{
            width: '100%',
            maxWidth: '440px',
            padding: '36px 30px',
            textAlign: 'center',
            border: '1px solid var(--border-glow)',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.45)',
          }}
        >
          <div
            style={{
              width: '60px',
              height: '60px',
              margin: '0 auto 20px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(16, 185, 129, 0.2) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--indigo-ink)',
            }}
          >
            <Shield size={30} />
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '8px' }}>
            Kitty Superadmin Portal
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
            Enter your platform master passkey to access system-wide management and analytics.
          </p>

          <form onSubmit={handleAdminLogin}>
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label htmlFor="admin-key">Master Security Passkey</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="admin-key"
                  type="password"
                  className="form-control mono"
                  placeholder="Enter admin passkey..."
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  autoFocus
                  required
                />
                <KeyRound
                  size={17}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-dim)',
                  }}
                />
              </div>
              <div className="form-hint">Default dev key: <code>admin123</code> (or configure <code>ADMIN_KEY</code>)</div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '16px' }}
              disabled={loggingIn}
            >
              {loggingIn ? 'Authenticating...' : 'Unlock Admin Portal'}
            </button>

            <button
              type="button"
              className="btn btn-subtle"
              style={{ width: '100%', marginTop: '10px' }}
              onClick={onBack}
            >
              <ArrowLeft size={16} /> Back to Kitty
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 3. Authenticated Superadmin Dashboard
  return (
    <div style={{ maxWidth: '1160px', margin: '0 auto', padding: '24px 20px 80px' }}>
      {/* Top Admin Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '26px',
          paddingBottom: '20px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--indigo) 0%, var(--emerald) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <ShieldCheck size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800 }}>
                Kitty Superadmin
              </h2>
              <span className="badge badge-positive" style={{ fontSize: '0.72rem' }}>
                LIVE PLATFORM
              </span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Real-time platform ledger, users & rooms moderation
            </p>
          </div>
        </div>

        {/* Header Navigation Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-subtle btn-sm"
            onClick={loadAdminData}
            disabled={loadingData}
            title="Refresh latest data"
          >
            <RefreshCw size={15} className={loadingData ? 'animate-spin' : ''} /> Refresh
          </button>

          <button
            type="button"
            className="btn btn-subtle btn-sm"
            onClick={onBack}
          >
            <ArrowLeft size={15} /> Exit to Rooms
          </button>

          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={handleAdminLogout}
          >
            <LogOut size={15} /> Lock Admin
          </button>
        </div>
      </div>

      {/* Admin Tab Switcher */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '10px',
        }}
      >
        <button
          type="button"
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Layers size={16} /> Overview
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={16} /> Users ({usersList.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'rooms' ? 'active' : ''}`}
          onClick={() => setActiveTab('rooms')}
        >
          <Building size={16} /> Rooms ({roomsList.length})
        </button>
      </div>

      {/* ─── TAB 1: OVERVIEW ──────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div>
          {/* Key Metric Highlights */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              marginBottom: '30px',
            }}
          >
            {/* Metric 1: Users */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Registered Users
                </span>
                <div
                  style={{
                    padding: '8px',
                    borderRadius: '10px',
                    background: 'var(--indigo-subtle)',
                    color: 'var(--indigo-ink)',
                  }}
                >
                  <Users size={20} />
                </div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '10px' }} className="mono">
                {stats?.total_users ?? usersList.length}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                Unique phone accounts on platform
              </div>
            </div>

            {/* Metric 2: Rooms */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Active Rooms
                </span>
                <div
                  style={{
                    padding: '8px',
                    borderRadius: '10px',
                    background: 'var(--emerald-subtle)',
                    color: 'var(--emerald-ink)',
                  }}
                >
                  <Building size={20} />
                </div>
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '10px' }} className="mono">
                {stats?.total_rooms ?? roomsList.length}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                Flats, hostels & shared spaces
              </div>
            </div>

            {/* Metric 3: Total Expenses Volume */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Total Expense Volume
                </span>
                <div
                  style={{
                    padding: '8px',
                    borderRadius: '10px',
                    background: 'rgba(234, 179, 8, 0.15)',
                    color: '#eab308',
                  }}
                >
                  <TrendingUp size={20} />
                </div>
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '10px' }} className="mono">
                {formatMoney(stats?.total_volume_minor || 0)}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                Across {stats?.total_expenses || 0} logged transactions
              </div>
            </div>

            {/* Metric 4: Total Settled Payments */}
            <div className="card" style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Total Settled Debts
                </span>
                <div
                  style={{
                    padding: '8px',
                    borderRadius: '10px',
                    background: 'var(--emerald-subtle)',
                    color: 'var(--emerald-ink)',
                  }}
                >
                  <CheckCircle size={20} />
                </div>
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '10px', color: 'var(--emerald-ink)' }} className="mono">
                {formatMoney(stats?.total_settled_minor || 0)}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                {stats?.total_settlements || 0} UPI & direct settlements
              </div>
            </div>
          </div>

          {/* Two-Column Deep Analytics */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '24px',
            }}
          >
            {/* Category Breakdown Card */}
            <div className="card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tag size={17} style={{ color: 'var(--indigo-ink)' }} /> Platform Category Distribution
              </h3>

              {stats?.categories_breakdown && stats.categories_breakdown.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {stats.categories_breakdown.map((cat) => {
                    const pct =
                      stats.total_volume_minor > 0
                        ? Math.round((cat.amount_minor / stats.total_volume_minor) * 100)
                        : 0;
                    return (
                      <div key={cat.category}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '5px' }}>
                          <span style={{ fontWeight: 600 }}>
                            {cat.category} <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>({cat.count} bills)</span>
                          </span>
                          <span className="mono" style={{ fontWeight: 600 }}>
                            {formatMoney(cat.amount_minor)} <span style={{ color: 'var(--text-muted)' }}>({pct}%)</span>
                          </span>
                        </div>
                        <div style={{ height: '7px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(100, Math.max(2, pct))}%`,
                              background: 'linear-gradient(90deg, var(--indigo) 0%, var(--emerald) 100%)',
                              borderRadius: '4px',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '30px 0' }}>
                  No expenses recorded yet.
                </div>
              )}
            </div>

            {/* Recent Signups & Events Card */}
            <div className="card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={17} style={{ color: 'var(--emerald-ink)' }} /> Recently Joined Roomies
              </h3>

              {stats?.recent_users && stats.recent_users.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {stats.recent_users.map((u) => (
                    <div
                      key={u.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: 'var(--indigo-subtle)',
                            color: 'var(--indigo-ink)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                          }}
                        >
                          {u.name ? u.name[0].toUpperCase() : 'U'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{u.name}</div>
                          <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                            +91 {u.phone}
                          </div>
                        </div>
                      </div>
                      <span className="badge badge-misc" style={{ fontSize: '0.72rem' }}>
                        ID #{u.id}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '30px 0' }}>
                  No recent signups.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: USERS MANAGEMENT ─────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="card" style={{ padding: '24px' }}>
          {/* Search Header */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              marginBottom: '20px',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                Platform Users ({filteredUsers.length})
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Inspect registered flatmates, phone numbers and room memberships
              </p>
            </div>

            <div style={{ position: 'relative', width: '280px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search by name, phone or ID..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-dim)',
                }}
              />
            </div>
          </div>

          {/* Users List Table */}
          {filteredUsers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)' }}>
              No users matching your search query.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px 12px' }}>User</th>
                    <th style={{ padding: '10px 12px' }}>Mobile Phone</th>
                    <th style={{ padding: '10px 12px' }}>UPI ID</th>
                    <th style={{ padding: '10px 12px' }}>Active Rooms</th>
                    <th style={{ padding: '10px 12px' }}>Joined Date</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              background: 'var(--indigo-subtle)',
                              color: 'var(--indigo-ink)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                            }}
                          >
                            {u.name ? u.name[0].toUpperCase() : 'U'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600 }}>{u.name}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>ID #{u.id}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px' }} className="mono">
                        +91 {u.phone}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {u.upi_id ? (
                          <span className="mono" style={{ color: 'var(--emerald-ink)', fontSize: '0.82rem' }}>
                            {u.upi_id}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-dim)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span className="badge badge-misc" style={{ fontSize: '0.75rem' }}>
                          {u.rooms_count} {u.rooms_count === 1 ? 'Room' : 'Rooms'}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-muted)' }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                          onClick={() => setDeleteTargetUser(u)}
                          title="Delete user account"
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: ROOMS MANAGEMENT ─────────────────────────────────────── */}
      {activeTab === 'rooms' && (
        <div className="card" style={{ padding: '24px' }}>
          {/* Search Header */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              marginBottom: '20px',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                Platform Rooms ({filteredRooms.length})
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Inspect rooms, invite codes, room owners and total expenses
              </p>
            </div>

            <div style={{ position: 'relative', width: '280px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search by room name or code..."
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
              />
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-dim)',
                }}
              />
            </div>
          </div>

          {/* Rooms Table */}
          {filteredRooms.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)' }}>
              No rooms matching your search query.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px 12px' }}>Code</th>
                    <th style={{ padding: '10px 12px' }}>Room Name</th>
                    <th style={{ padding: '10px 12px' }}>Created By (Owner)</th>
                    <th style={{ padding: '10px 12px' }}>Active Members</th>
                    <th style={{ padding: '10px 12px' }}>Total Spent</th>
                    <th style={{ padding: '10px 12px' }}>Created Date</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRooms.map((r) => (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '12px' }}>
                        <span className="badge badge-misc mono" style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                          {r.code}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                          {r.expense_count} {r.expense_count === 1 ? 'expense' : 'expenses'}
                        </div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div>{r.creator_name}</div>
                        {r.creator_phone && (
                          <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                            +91 {r.creator_phone}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span className="badge badge-misc" style={{ fontSize: '0.75rem' }}>
                          {r.member_count} {r.member_count === 1 ? 'member' : 'members'}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }} className="mono">
                        <span style={{ fontWeight: 600, color: 'var(--emerald-ink)' }}>
                          {formatMoney(r.total_spent_minor)}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-muted)' }}>
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-subtle btn-sm"
                            style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                            onClick={() => onSelectRoom(r.code)}
                            title="Open Room view"
                          >
                            Open <ArrowRight size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                            onClick={() => setDeleteTargetRoom(r)}
                            title="Delete Room permanently"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL: CONFIRM DELETE USER ───────────────────────────────────── */}
      {deleteTargetUser && (
        <Modal
          isOpen={Boolean(deleteTargetUser)}
          onClose={() => setDeleteTargetUser(null)}
          title="Delete User Account"
        >
          <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
            <div
              style={{
                width: '50px',
                height: '50px',
                margin: '0 auto 16px',
                borderRadius: '50%',
                background: 'var(--coral-subtle)',
                color: 'var(--coral-ink)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={24} />
            </div>
            <h4 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 700 }}>
              Are you sure you want to delete {deleteTargetUser.name}?
            </h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              This will remove this user from all shared rooms, delete their notifications, and revoke their access. This action cannot be undone.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button
              type="button"
              className="btn btn-subtle"
              onClick={() => setDeleteTargetUser(null)}
              disabled={actionLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={confirmDeleteUser}
              disabled={actionLoading}
            >
              {actionLoading ? 'Deleting...' : 'Yes, Delete User'}
            </button>
          </div>
        </Modal>
      )}

      {/* ─── MODAL: CONFIRM DELETE ROOM ───────────────────────────────────── */}
      {deleteTargetRoom && (
        <Modal
          isOpen={Boolean(deleteTargetRoom)}
          onClose={() => setDeleteTargetRoom(null)}
          title="Delete Shared Room"
        >
          <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
            <div
              style={{
                width: '50px',
                height: '50px',
                margin: '0 auto 16px',
                borderRadius: '50%',
                background: 'var(--coral-subtle)',
                color: 'var(--coral-ink)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Trash2 size={24} />
            </div>
            <h4 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 700 }}>
              Delete room "{deleteTargetRoom.name}" ({deleteTargetRoom.code})?
            </h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              This will permanently delete this room along with all its logged expenses, split debts, recurring bill templates, and settlement history.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button
              type="button"
              className="btn btn-subtle"
              onClick={() => setDeleteTargetRoom(null)}
              disabled={actionLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={confirmDeleteRoom}
              disabled={actionLoading}
            >
              {actionLoading ? 'Deleting...' : 'Yes, Delete Room'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
