import React from 'react';
import { Home, Plus, User } from 'lucide-react';

/**
 * Native-app style bottom tab bar (mobile only).
 * - "Rooms"  → rooms dashboard
 * - Center FAB → context quick-add (Create room on dashboard / Add expense in a room)
 * - "You"    → profile & settlement details
 *
 * The FAB dispatches a `kitty:quick-add` window event; whichever screen is
 * mounted (RoomsDashboard or RoomView) opens its own composer. That keeps the
 * nav decoupled from page internals.
 */
export default function BottomNav({ view, onNavigateRooms, onOpenProfile }) {
  const fabLabel = view === 'room' ? 'Add expense' : 'Create room';

  const quickAdd = () => {
    window.dispatchEvent(new CustomEvent('kitty:quick-add'));
  };

  return (
    <nav className="bottom-nav" aria-label="App navigation">
      <button
        type="button"
        className={`bottom-nav-item ${view === 'rooms' ? 'active' : ''}`}
        onClick={onNavigateRooms}
        aria-label="Rooms"
        aria-current={view === 'rooms' ? 'page' : undefined}
      >
        <Home size={21} strokeWidth={view === 'rooms' ? 2.4 : 1.8} />
        <span>Rooms</span>
      </button>

      <button
        type="button"
        className="fab-btn"
        onClick={quickAdd}
        aria-label={fabLabel}
        title={fabLabel}
      >
        <Plus size={27} strokeWidth={2.6} />
      </button>

      <button
        type="button"
        className="bottom-nav-item"
        onClick={onOpenProfile}
        aria-label="Your profile"
      >
        <User size={21} strokeWidth={1.8} />
        <span>You</span>
      </button>
    </nav>
  );
}
