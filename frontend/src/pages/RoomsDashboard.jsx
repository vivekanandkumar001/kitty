import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import {
  Plus,
  Users,
  Copy,
  Check,
  Building,
  ArrowRight,
  LogIn,
  Layers,
  Sparkles,
} from 'lucide-react';

export default function RoomsDashboard({ onSelectRoom }) {
  const { showToast } = useToast();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div>
      {/* Top action bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '28px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            Your Rooms
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', margin: 0 }}>
            Manage shared apartments, hostel flats, and project groups.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowJoinModal(true)}
          >
            <LogIn size={16} /> Join with Code
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={16} /> Create Room
          </button>
        </div>
      </div>

      {/* Room list or empty state */}
      {loading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '18px',
          }}
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="card" style={{ height: '170px', opacity: 0.5 }}>
              <div style={{ height: '24px', width: '50%', background: 'rgba(255,255,255,0.08)', borderRadius: '6px', marginBottom: '14px' }}></div>
              <div style={{ height: '16px', width: '80%', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}></div>
            </div>
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            maxWidth: '520px',
            margin: '40px auto',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--emerald-subtle)',
              color: 'var(--emerald-ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px',
            }}
          >
            <Building size={28} />
          </div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>No rooms yet</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginBottom: '24px' }}>
            Create a room for your flatmates or join an existing room with an invite code.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus size={16} /> Create New Room
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowJoinModal(true)}
            >
              <LogIn size={16} /> Join by Code
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '18px',
          }}
        >
          {rooms.map((room) => (
            <div
              key={room.code}
              className="card card-clickable"
              onClick={() => onSelectRoom(room.code)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div className="card-header-flex">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(99,102,241,0.15) 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--emerald-ink)',
                      }}
                    >
                      <Building size={20} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                        {room.name}
                      </h4>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                        Created {new Date(room.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Room Code Badge */}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm mono"
                    style={{
                      fontSize: '0.78rem',
                      letterSpacing: '0.04em',
                      padding: '4px 8px',
                    }}
                    onClick={(e) => copyCode(room.code, e)}
                    title="Click to copy room code"
                  >
                    {copiedCode === room.code ? (
                      <>
                        <Check size={12} color="var(--emerald)" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={12} /> {room.code}
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '16px',
                  marginTop: '16px',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <Users size={15} />
                  <span>Open Room Dashboard</span>
                </div>
                <div style={{ color: 'var(--emerald-ink)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
                  Enter <ArrowRight size={15} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Create Room */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Room"
      >
        <form onSubmit={handleCreateRoom}>
          <div className="form-group">
            <label htmlFor="create-room-name">Room Name</label>
            <input
              id="create-room-name"
              type="text"
              className="form-control"
              placeholder="e.g. Flat 302, Green Glen"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              autoFocus
              required
            />
            <div className="form-hint">
              Give your flat or group a recognizable name. You'll receive a 6-character code to invite others.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={actionLoading}
            >
              {actionLoading ? 'Creating...' : 'Create Room'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Join Room */}
      <Modal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        title="Join Room with Code"
      >
        <form onSubmit={handleJoinRoom}>
          <div className="form-group">
            <label htmlFor="join-room-code">6-Character Room Code</label>
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
              style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '1.1rem' }}
            />
            <div className="form-hint">
              Ask your roommate for the room invite code to join immediately.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowJoinModal(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={actionLoading}
            >
              {actionLoading ? 'Joining...' : 'Join Room'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
