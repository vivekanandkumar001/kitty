import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../theme';
import {
  Split,
  Bell,
  LogOut,
  User,
  Check,
  ChevronDown,
  Building,
  CreditCard,
  Shield,
  Sun,
  Moon,
  CheckCheck,
  Inbox,
} from 'lucide-react';

export default function Navbar({ onSelectRoom, onNavigateRooms, onOpenProfile, onOpenAdmin, currentRoom }) {
  const { user, logout, notifications, markNotificationRead, markAllNotificationsRead } = useAuth();
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const notifRef = useRef(null);
  const userMenuRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on Escape for polish
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') {
        setShowNotifs(false);
        setShowUserMenu(false);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      showToast('Logged out successfully', 'info');
    } catch {
      showToast('Error logging out', 'error');
    }
  };

  const handleNotifClick = (notif) => {
    if (!notif.read_at) markNotificationRead(notif.id);
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
        {/* Brand + breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', minWidth: 0 }}>
          <button
            type="button"
            className="nav-brand"
            onClick={onNavigateRooms}
            style={{ textAlign: 'left' }}
            aria-label="Kitty home"
          >
            <div className="brand-icon-wrap">
              <Split size={20} strokeWidth={2.4} />
            </div>
            <span>Kitty</span>
            <span className="brand-badge">Enterprise</span>
          </button>

          {currentRoom && (
            <div className="nav-crumb">
              <span className="nav-crumb-sep">/</span>
              <button
                type="button"
                className="btn btn-subtle btn-sm"
                onClick={onNavigateRooms}
                style={{ display: 'flex', alignItems: 'center', gap: '7px' }}
              >
                <Building size={14} />
                <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentRoom.name}
                </span>
              </button>
              <span className="chip">{currentRoom.code}</span>
            </div>
          )}
        </div>

        {/* Right cluster */}
        {user && (
          <div className="nav-right">
            {/* Theme toggle */}
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              <span className="toggle-icon">
                <Sun size={15} />
              </span>
              <span className="toggle-icon">
                <Moon size={15} />
              </span>
              <span className="toggle-thumb">
                {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
              </span>
            </button>

            <div className="nav-divider" />

            {/* Notifications */}
            <div className="menu-wrap" ref={notifRef}>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowNotifs((v) => !v)}
                aria-label="Notifications"
                aria-expanded={showNotifs}
              >
                <Bell size={17} />
                {notifications.unread > 0 && <span className="unread-badge">{notifications.unread}</span>}
              </button>

              {showNotifs && (
                <div className="notif-panel" role="dialog" aria-label="Notifications">
                  <div className="notif-header">
                    <h4>
                      Notifications
                      {notifications.unread > 0 && <span className="notif-count">{notifications.unread} new</span>}
                    </h4>
                    {notifications.unread > 0 && (
                      <button
                        type="button"
                        className="btn btn-subtle btn-xs"
                        onClick={markAllNotificationsRead}
                      >
                        <CheckCheck size={13} /> Mark all read
                      </button>
                    )}
                  </div>
                  <div className="notif-list">
                    {notifications.items.length === 0 ? (
                      <div className="notif-empty">
                        <Inbox size={26} strokeWidth={1.5} />
                        <span>All quiet here. Room events will appear in this feed.</span>
                      </div>
                    ) : (
                      notifications.items.map((n) => (
                        <div
                          key={n.id}
                          className={`notif-item ${!n.read_at ? 'unread' : ''}`}
                          onClick={() => handleNotifClick(n)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && handleNotifClick(n)}
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

            {/* User menu */}
            <div className="menu-wrap" ref={userMenuRef}>
              <button
                type="button"
                className="user-menu-btn"
                onClick={() => setShowUserMenu((v) => !v)}
                aria-expanded={showUserMenu}
                aria-haspopup="menu"
              >
                <div className="user-avatar-badge">
                  {user.name ? user.name[0].toUpperCase() : 'U'}
                </div>
                <span className="user-menu-name" style={{ fontSize: '0.87rem', fontWeight: 600, maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name}
                </span>
                <ChevronDown size={14} style={{ color: 'var(--text-dim)', transition: 'transform 0.2s', transform: showUserMenu ? 'rotate(180deg)' : 'none' }} />
              </button>

              {showUserMenu && (
                <div className="notif-panel" style={{ width: '260px', padding: '6px' }} role="menu">
                  <div className="menu-heading">
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', letterSpacing: '-0.01em' }}>{user.name}</div>
                    <div style={{ fontSize: '0.77rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>+91 {user.phone}</div>
                    {user.upi_id && (
                      <div
                        style={{
                          fontSize: '0.74rem',
                          color: 'var(--emerald-ink)',
                          marginTop: '5px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        <CreditCard size={12} /> {user.upi_id}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      setShowUserMenu(false);
                      onOpenProfile();
                    }}
                  >
                    <User size={15} /> Edit profile &amp; UPI
                  </button>

                  {onOpenAdmin && (
                    <button
                      type="button"
                      className="menu-item accent"
                      onClick={() => {
                        setShowUserMenu(false);
                        onOpenAdmin();
                      }}
                    >
                      <Shield size={15} /> Superadmin console
                    </button>
                  )}

                  <button type="button" className="menu-item danger" onClick={handleLogout}>
                    <LogOut size={15} /> Log out
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
