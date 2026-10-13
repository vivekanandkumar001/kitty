import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Split,
  Bell,
  LogOut,
  User,
  Check,
  ChevronDown,
  Building,
  CreditCard,
  ExternalLink,
} from 'lucide-react';

export default function Navbar({ currentRoom, onSelectRoom, onNavigateRooms, onOpenProfile }) {
  const { user, logout, notifications, markNotificationRead, markAllNotificationsRead } = useAuth();
  const { showToast } = useToast();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const notifRef = useRef(null);
  const userMenuRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifs(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      showToast('Logged out successfully', 'info');
    } catch (err) {
      showToast('Error logging out', 'error');
    }
  };

  const handleNotifClick = (notif) => {
    if (!notif.read_at) {
      markNotificationRead(notif.id);
    }
    // If notification has link e.g. /room/CODE
    if (notif.link && notif.link.startsWith('/room/')) {
      const code = notif.link.split('/')[2];
      if (code) {
        onSelectRoom(code);
        setShowNotifs(false);
      }
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button
            type="button"
            className="nav-brand"
            onClick={onNavigateRooms}
            style={{ cursor: 'pointer', textAlign: 'left' }}
          >
            <div className="brand-icon-wrap">
              <Split size={20} />
            </div>
            <span>Kitty</span>
            <span className="brand-badge">SPA</span>
          </button>

          {currentRoom && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: 'var(--text-dim)' }}>/</span>
              <button
                type="button"
                className="btn btn-subtle btn-sm"
                onClick={onNavigateRooms}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Building size={15} />
                <span>{currentRoom.name}</span>
                <span className="badge badge-misc mono" style={{ fontSize: '0.7rem' }}>
                  {currentRoom.code}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Right side navigation & controls */}
        {user && (
          <div className="nav-right">
            {/* Notification Bell */}
            <div className="notif-menu-wrap" ref={notifRef}>
              <button
                type="button"
                className="bell-btn"
                onClick={() => setShowNotifs(!showNotifs)}
                aria-label="Notifications"
              >
                <Bell size={18} />
                {notifications.unread > 0 && (
                  <span className="unread-badge">{notifications.unread}</span>
                )}
              </button>

              {showNotifs && (
                <div className="notif-panel">
                  <div className="notif-header">
                    <h4>Notifications</h4>
                    {notifications.unread > 0 && (
                      <button
                        type="button"
                        className="btn btn-subtle btn-sm"
                        style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                        onClick={markAllNotificationsRead}
                      >
                        <Check size={13} /> Mark all read
                      </button>
                    )}
                  </div>
                  <div className="notif-list">
                    {notifications.items.length === 0 ? (
                      <div className="notif-empty">No notifications yet</div>
                    ) : (
                      notifications.items.map((n) => (
                        <div
                          key={n.id}
                          className={`notif-item ${!n.read_at ? 'unread' : ''}`}
                          onClick={() => handleNotifClick(n)}
                        >
                          <div className="notif-item-title">{n.title}</div>
                          {n.body && <div className="notif-item-body">{n.body}</div>}
                          <div className="notif-item-date">
                            {new Date(n.created_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Menu */}
            <div className="notif-menu-wrap" ref={userMenuRef}>
              <button
                type="button"
                className="user-menu-btn"
                onClick={() => setShowUserMenu(!showUserMenu)}
              >
                <div className="user-avatar-badge">
                  {user.name ? user.name[0].toUpperCase() : 'U'}
                </div>
                <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{user.name}</span>
                <ChevronDown size={14} style={{ color: 'var(--text-dim)' }} />
              </button>

              {showUserMenu && (
                <div
                  className="notif-panel"
                  style={{ width: '220px', padding: '6px' }}
                >
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{user.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      +91 {user.phone}
                    </div>
                    {user.upi_id && (
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--emerald-ink)',
                          marginTop: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <CreditCard size={12} /> {user.upi_id}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="btn btn-subtle btn-sm"
                    style={{
                      width: '100%',
                      justifyContent: 'flex-start',
                      padding: '9px 12px',
                      borderRadius: 'var(--radius-xs)',
                    }}
                    onClick={() => {
                      setShowUserMenu(false);
                      onOpenProfile();
                    }}
                  >
                    <User size={15} /> Edit Profile / UPI
                  </button>

                  <button
                    type="button"
                    className="btn btn-subtle btn-sm"
                    style={{
                      width: '100%',
                      justifyContent: 'flex-start',
                      padding: '9px 12px',
                      borderRadius: 'var(--radius-xs)',
                      color: 'var(--coral-ink)',
                    }}
                    onClick={handleLogout}
                  >
                    <LogOut size={15} /> Log Out
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
