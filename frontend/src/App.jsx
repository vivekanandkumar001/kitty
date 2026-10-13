import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Navbar from './components/Navbar';
import ProfileModal from './components/ProfileModal';
import AuthPage from './pages/AuthPage';
import RoomsDashboard from './pages/RoomsDashboard';
import RoomView from './pages/RoomView';
import { Split } from 'lucide-react';

function MainApp() {
  const { user, loading } = useAuth();
  const [selectedRoomCode, setSelectedRoomCode] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          color: 'var(--text-muted)',
        }}
      >
        <div
          style={{
            width: '44px',
            height: '44px',
            background: 'linear-gradient(135deg, var(--emerald) 0%, var(--indigo) 100%)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            animation: 'pulse 1.5s infinite ease-in-out',
          }}
        >
          <Split size={24} />
        </div>
        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Loading Kitty...</div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {user && (
        <Navbar
          currentRoom={selectedRoomCode ? { code: selectedRoomCode, name: `Room ${selectedRoomCode}` } : null}
          onSelectRoom={(code) => setSelectedRoomCode(code)}
          onNavigateRooms={() => setSelectedRoomCode(null)}
          onOpenProfile={() => setShowProfileModal(true)}
        />
      )}

      <main className="app-main">
        {!user ? (
          <AuthPage />
        ) : selectedRoomCode ? (
          <RoomView
            roomCode={selectedRoomCode}
            onBack={() => setSelectedRoomCode(null)}
          />
        ) : (
          <RoomsDashboard onSelectRoom={(code) => setSelectedRoomCode(code)} />
        )}
      </main>

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
