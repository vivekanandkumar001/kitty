import React, { useState, useEffect, useMemo } from 'react';
import { apiRequest, formatMoney } from '../api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';
import {
  Plus,
  Copy,
  Check,
  Building,
  ArrowRight,
  LogIn,
  LayoutGrid,
  CalendarClock,
  ShieldCheck,
  DoorOpen,
  ChevronRight,
  Wallet,
} from 'lucide-react';

export default function RoomsDashboard({ onSelectRoom }) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  // Per-room net balance for me (paise). Best-effort: rooms that fail just
  // don't contribute to the aggregate.
  const [myBalances, setMyBalances] = useState({});

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Copied code feedback
  const [copiedCode, setCopiedCode] = useState(null);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/api/rooms');
      setRooms(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast(err.message || 'Failed to load rooms', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aggregate my balance across rooms (Revolut/CRED-style "money position")
  useEffect(() => {
    if (!user || rooms.length === 0) return undefined;
    let cancelled = false;
    Promise.allSettled(
      rooms.map((room) => apiRequest(`/api/rooms/${room.code}/balances`))
    ).then((results) => {
      if (cancelled) return;
      const map = {};
      results.forEach((res, i) => {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          const me = res.value.find((b) => b.user_id === user.id);
          if (me) map[rooms[i].code] = me.balance_minor || 0;
        }
      });
      setMyBalances(map);
    });
    return () => {
      cancelled = true;
    };
  }, [rooms, user]);

  // Native bottom-bar FAB → open the create-room composer
  useEffect(() => {
    const handler = () => setShowCreateModal(true);
    window.addEventListener('kitty:quick-add', handler);
    return () => window.removeEventListener('kitty:quick-add', handler);
  }, []);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) {
      showToast('Please enter a room name', 'error');
      return;
    }
    try {
      setActionLoading(true);
      const created = await apiRequest('/api/rooms', {
        method: 'POST',
        body: { name: newRoomName.trim() },
      });
      showToast(`Created room "${created.name}"!`, 'success');
      setShowCreateModal(false);
      setNewRoomName('');
      onSelectRoom(created.code);
    } catch (err) {
      showToast(err.message || 'Error creating room', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) {
      showToast('Please enter the 6-character room code', 'error');
      return;
    }
    try {
      setActionLoading(true);
      const joined = await apiRequest('/api/rooms/join', {
        method: 'POST',
        body: { code: joinCode.trim().toUpperCase() },
      });
      showToast(`Joined room "${joined.name}"!`, 'success');
      setShowJoinModal(false);
      setJoinCode('');
      onSelectRoom(joined.code);
    } catch (err) {
      showToast(err.message || 'Invalid or expired room code', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const copyCode = (code, e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    showToast(`Room code ${code} copied to clipboard!`, 'info');
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const now = new Date();
  const createdThisMonth = rooms.filter((r) => {
    const d = new Date(r.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  // Aggregate "money position" across rooms — the fintech home pattern
  const position = useMemo(() => {
    const values = Object.values(myBalances);
    const net = values.reduce((sum, v) => sum + v, 0);
    const owedRooms = values.filter((v) => v > 0).length;
    const oweRooms = values.filter((v) => v < 0).length;
    const loaded = values.length > 0;
    return { net, owedRooms, oweRooms, loaded };
  }, [myBalances]);

  const positionSub = !position.loaded
    ? 'Ledger syncing…'
    : position.net > 0
      ? `${position.owedRooms} room${position.owedRooms === 1 ? '' : 's'} owe you · tap a room to review & settle`
      : position.net < 0
        ? `You owe in ${position.oweRooms} room${position.oweRooms === 1 ? '' : 's'} · settle from inside the room`
        : 'Everything is settled up across your rooms';

  return (
    <div className="animate-in">
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <div className="eyebrow"><span className="dot" /> Workspace / Rooms</div>
          <h1 className="page-title">Your shared-living ledgers</h1>
          <p className="page-subtitle">
            Every flat, PG wing and project group — expenses, splits, settlements and move-out
            math in one audit-grade place.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setShowJoinModal(true)}>
            <LogIn size={16} /> Join with code
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> Create room
          </button>
        </div>
      </div>

      {/* ── Money position hero (fintech home pattern) ──────────── */}
      {rooms.length > 0 && (
        <div className={`money-hero ${position.net > 0 ? 'pos' : position.net < 0 ? 'neg' : 'zero'}`} role="status" aria-label="Your net balance across rooms">
        <div className="money-hero-text">
          <span className="money-hero-label"><span className="dot" /> Your money position</span>
          <span className="money-hero-value mono">
            {position.loaded ? `${position.net >= 0 ? '+' : '−'}${formatMoney(Math.abs(position.net))}` : '— —'}
          </span>
          <span className="money-hero-sub">{positionSub}</span>
        </div>
        {position.net !== 0 && (
          <div className="money-hero-icon"><Wallet size={24} strokeWidth={1.8} /></div>
        )}
        </div>
      )}

      {/* ── KPI strip ───────────────────────────────────────────── */}
      <div className="stats-grid" style={{ marginBottom: '26px' }}>
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Active rooms</span>
            <span className="icon-chip emerald"><LayoutGrid size={16} /></span>
          </div>
          <div className="stat-value">{loading ? '—' : rooms.length}</div>
          <div className="stat-sub">Flats, PGs &amp; groups you belong to</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Created this month</span>
            <span className="icon-chip indigo"><CalendarClock size={16} /></span>
          </div>
          <div className="stat-value">{loading ? '—' : createdThisMonth}</div>
          <div className="stat-sub">New ledgers spun up in {now.toLocaleDateString(undefined, { month: 'long' })}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Settlement engine</span>
            <span className="icon-chip amber"><ShieldCheck size={16} /></span>
          </div>
          <div className="stat-value" style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '9px', height: '9px', borderRadius: '9999px', background: 'var(--emerald)', boxShadow: '0 0 10px var(--emerald-glow)', display: 'inline-block' }} />
            Operational
          </div>
          <div className="stat-sub">Deterministic debt simplification · paise-exact</div>
        </div>
      </div>

      {/* ── Room grid ───────────────────────────────────────────── */}
      {loading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px',
          }}
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: '168px' }} />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="section-card">
          <div className="empty-state" style={{ padding: '64px 24px' }}>
            <div className="empty-icon">
              <DoorOpen size={26} strokeWidth={1.8} />
            </div>
            <h4>No rooms yet — let&apos;s fix that</h4>
            <p>Create a room for your flat or join an existing one with a 6-character invite code from a roommate.</p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                <Plus size={16} /> Create your first room
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowJoinModal(true)}>
                <LogIn size={16} /> Join by code
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="room-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))',
            gap: '16px',
          }}
        >
          {rooms.map((room) => (
            <div
              key={room.code}
              className="card card-clickable room-card"
              onClick={() => onSelectRoom(room.code)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelectRoom(room.code)}
            >
              <div className="room-card-top">
                <div
                  className="room-card-icon"
                >
                  <Building size={21} strokeWidth={1.9} />
                </div>
                <div className="room-card-text">
                  <h3 className="room-card-name">{room.name}</h3>
                  <span className="room-card-meta">
                    {room.member_count ?? '—'} member{room.member_count === 1 ? '' : 's'}{' · '}
                    {(() => {
                      const d = room.created_at ? new Date(room.created_at) : null;
                      return d && !isNaN(d) ? `opened ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'recently opened';
                    })()}
                  </span>
                </div>
                {myBalances[room.code] !== undefined && (
                  <span className={`room-card-balance mono ${myBalances[room.code] > 0 ? 'pos' : myBalances[room.code] < 0 ? 'neg' : 'zero'}`}>
                    {myBalances[room.code] > 0
                      ? `+${formatMoney(myBalances[room.code])}`
                      : myBalances[room.code] < 0
                        ? `−${formatMoney(Math.abs(myBalances[room.code]))}`
                        : '₹0'}
                  </span>
                )}
                <ChevronRight size={18} className="room-card-chevron" aria-hidden="true" />
              </div>

              {/* Footer row: invite code + open */}
              <div className="room-card-foot">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm mono"
                  style={{ fontSize: '0.76rem', letterSpacing: '0.06em' }}
                  onClick={(e) => copyCode(room.code, e)}
                  title="Click to copy invite code"
                >
                  {copiedCode === room.code ? (
                    <><Check size={12} color="var(--emerald-ink)" /> Copied</>
                  ) : (
                    <><Copy size={12} /> {room.code}</>
                  )}
                </button>

                <span className="room-card-open">
                  Open dashboard <ArrowRight size={14} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal: Create Room ──────────────────────────────────── */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create new room"
        subtitle="A room is a shared ledger for one flat or group."
      >
        <form onSubmit={handleCreateRoom}>
          <div className="form-group">
            <label htmlFor="create-room-name">Room Name</label>
            <input
              id="create-room-name"
              type="text"
              className="form-control"
              placeholder="e.g. Flat 302, Green Glen Layout"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              autoFocus
              required
            />
            <div className="form-hint">
              You&apos;ll receive a 6-character invite code to onboard flatmates instantly.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={actionLoading}>
              {actionLoading ? 'Creating…' : 'Create room'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Join Room ────────────────────────────────────── */}
      <Modal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        title="Join with invite code"
        subtitle="6 characters, case-insensitive."
      >
        <form onSubmit={handleJoinRoom}>
          <div className="form-group">
            <label htmlFor="join-room-code">Room Code</label>
            <input
              id="join-room-code"
              type="text"
              className="form-control mono"
              placeholder="e.g. AB12CD"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              autoFocus
              required
              style={{ textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: '1.15rem', textAlign: 'center' }}
            />
            <div className="form-hint">Ask any active member of the room for the invite code.</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowJoinModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={actionLoading}>
              {actionLoading ? 'Joining…' : 'Join room'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
