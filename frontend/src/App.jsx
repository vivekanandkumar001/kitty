import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Navbar from './components/Navbar';
import ProfileModal from './components/ProfileModal';
import AuthPage from './pages/AuthPage';
import RoomsDashboard from './pages/RoomsDashboard';
import RoomView from './pages/RoomView';
import AdminDashboard from './pages/AdminDashboard';
import { CodeXml, ShieldCheck } from 'lucide-react';
import Logo from './components/Logo';

function MainApp() {
  const { user, loading } = useAuth();
  const [selectedRoomCode, setSelectedRoomCode] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAdmin, setShowAdmin] = useState(
    window.location.hash === '#admin' || window.location.pathname === '/admin'
  );

  if (loading) {
    return (
      <div className="loading-screen">
        <Logo size={56} className="loading-logo" />
        <div style={{ fontWeight: 600, fontSize: '0.92rem', letterSpacing: '-0.01em' }}>
          Loading Kitty…
        </div>
      </div>
    );
  }

  // Not signed in → full-bleed auth experience (no chrome)
  if (!user && !showAdmin) {
    return <AuthPage onOpenAdmin={() => setShowAdmin(true)} />;
  }

  return (
    <div className="app-layout">
      {user && (
        <Navbar
          currentRoom={selectedRoomCode ? { code: selectedRoomCode, name: `Room ${selectedRoomCode}` } : null}
          onSelectRoom={(code) => {
            setShowAdmin(false);
            setSelectedRoomCode(code);
          }}
          onNavigateRooms={() => {
            setShowAdmin(false);
            setSelectedRoomCode(null);
          }}
          onOpenProfile={() => setShowProfileModal(true)}
          onOpenAdmin={() => {
            setShowAdmin(true);
            setSelectedRoomCode(null);
          }}
        />
      )}

      <main className="app-main">
        {showAdmin ? (
          <AdminDashboard
            onBack={() => setShowAdmin(false)}
            onSelectRoom={(code) => {
              setShowAdmin(false);
              setSelectedRoomCode(code);
            }}
          />
        ) : selectedRoomCode ? (
          <RoomView
            roomCode={selectedRoomCode}
            onBack={() => setSelectedRoomCode(null)}
          />
        ) : (
          <RoomsDashboard
            onSelectRoom={(code) => setSelectedRoomCode(code)}
            onOpenAdmin={() => setShowAdmin(true)}
          />
        )}
      </main>

      <footer className="app-footer">
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={13} style={{ color: 'var(--emerald-ink)' }} />
          Kitty Enterprise — paise-precise shared expenses
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span className="mono">integer-paise · deterministic · auditable</span>
          <a
            href="https://github.com/vivekanandkumar001/kitty"
            target="_blank"
            rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}
            className="footer-link"
          >
            <CodeXml size={14} /> vivekanandkumar001/kitty
          </a>
        </span>
      </footer>

      {user && (
        <ProfileModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <MainApp />
      </AuthProvider>
    </ToastProvider>
  );
}
