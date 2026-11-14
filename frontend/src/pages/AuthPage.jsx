import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../theme';
import {
  Split,
  Phone,
  KeyRound,
  User as UserIcon,
  ShieldCheck,
  Zap,
  ArrowRight,
  Receipt,
  Repeat,
  Scale,
  Lock,
  BadgeCheck,
  Landmark,
  Sun,
  Moon,
} from 'lucide-react';

export default function AuthPage({ onOpenAdmin }) {
  const { login, signup } = useAuth();
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();

  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!phone || !/^\d{10,15}$/.test(phone.trim())) {
      showToast('Please enter a valid 10-digit phone number', 'error');
      return;
    }
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      showToast('PIN must be exactly 4 digits', 'error');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        if (!name.trim()) {
          showToast('Please enter your name', 'error');
          setLoading(false);
          return;
        }
        await signup(name.trim(), phone.trim(), pin.trim());
        showToast('Account created successfully!', 'success');
      } else {
        await login(phone.trim(), pin.trim());
        showToast('Welcome back to Kitty!', 'success');
      }
    } catch (err) {
      showToast(err.message || 'Authentication failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      {/* Floating theme toggle (auth screens render without the navbar) */}
      <button
        type="button"
        className="theme-toggle auth-theme-toggle"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        <span className="toggle-icon"><Sun size={15} /></span>
        <span className="toggle-icon"><Moon size={15} /></span>
        <span className="toggle-thumb">{theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}</span>
      </button>

      {/* ── Left: hero / value proposition ─────────────────────────── */}
      <aside className="auth-hero">
        <span className="auth-badge">
          <Zap size={13} strokeWidth={2.5} /> Shared living, settled to the last paisa
        </span>

        <h1 className="auth-headline">
          One flat.
          <br />
          Every paisa,
          <br />
          <span className="grad">accounted for.</span>
        </h1>

        <p className="auth-sub">
          Kitty is the audit-grade ledger for flats, PGs and roommates — mathematically
          exact splits, deterministic debt simplification and one-tap UPI settlement,
          engineered so nobody ever has to chase anyone again.
        </p>

        <div className="auth-checklist">
          <div className="auth-check">
            <span className="check-dot"><Scale size={13} strokeWidth={2.5} /></span>
            <span>
              <strong>Deterministic debt simplification</strong> — N bilateral debts collapse
              into the mathematically minimal number of transfers. Same input, same output, every time.
            </span>
          </div>
          <div className="auth-check">
            <span className="check-dot"><Landmark size={13} strokeWidth={2.5} /></span>
            <span>
              <strong>Integer-paise ledger</strong> — every amount stored and computed in whole
              paise. Zero float drift, ever.
            </span>
          </div>
          <div className="auth-check">
            <span className="check-dot"><Repeat size={13} strokeWidth={2.5} /></span>
            <span>
              <strong>Recurring automation</strong> — rent, wifi, maid, mess. One click and the
              month generates itself, with reminders that clear automatically.
            </span>
          </div>
          <div className="auth-check">
            <span className="check-dot"><Receipt size={13} strokeWidth={2.5} /></span>
            <span>
              <strong>Every split type</strong> — equal, exact paise, percentage, or attendance-weighted,
              with dispute &amp; resolve built in.
            </span>
          </div>
        </div>

        <div className="auth-foot">
          <span><span className="mono">100%</span> integer-paise math</span>
          <span aria-hidden="true">·</span>
          <span><span className="mono">0</span> float drift</span>
          <span aria-hidden="true">·</span>
          <span><span className="mono">1-tap</span> UPI settlement</span>
        </div>
      </aside>

      {/* ── Right: sign in / sign up card ─────────────────────────── */}
      <div className="auth-form-pane">
        <div className="auth-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '22px' }}>
            <div className="brand-icon-wrap" style={{ width: '44px', height: '44px', borderRadius: '12px' }}>
              <Split size={22} strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em' }}>
                {mode === 'login' ? 'Sign in to Kitty' : 'Create your Kitty ID'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {mode === 'login' ? 'Your rooms are waiting.' : 'Free forever. No card required.'}
              </div>
            </div>
          </div>

          {/* Mode switcher */}
          <div className="segmented" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`segmented-btn ${mode === 'login' ? 'active' : ''}`}
              onClick={() => setMode('login')}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              className={`segmented-btn ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => setMode('signup')}
            >
              New Account
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div className="form-group">
                <label htmlFor="auth-name">Full Name</label>
                <div className="input-icon-wrap">
                  <input
                    id="auth-name"
                    type="text"
                    className="form-control"
                    placeholder="e.g. Vivekanand Kumar"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                  <UserIcon size={17} />
                </div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="auth-phone">Mobile Number</label>
              <div className="input-icon-wrap">
                <input
                  id="auth-phone"
                  type="tel"
                  className="form-control mono"
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={15}
                  autoComplete="tel"
                  inputMode="numeric"
                  required
                />
                <Phone size={17} />
              </div>
              <div className="form-hint">Used to identify you across your rooms. Never shown to other members.</div>
            </div>

            <div className="form-group">
              <label htmlFor="auth-pin">4-Digit Security PIN</label>
              <div className="input-icon-wrap">
                <input
                  id="auth-pin"
                  type="password"
                  className="form-control mono"
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  maxLength={4}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  inputMode="numeric"
                  required
                />
                <KeyRound size={17} />
              </div>
              <div className="form-hint">
                <Lock size={11} style={{ verticalAlign: '-1px', marginRight: '4px' }} />
                Hashed &amp; salted (scrypt) — never stored or logged in plaintext.
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '6px' }}
              disabled={loading}
            >
              {loading ? (
                'Verifying…'
              ) : mode === 'login' ? (
                <>Sign in to your rooms <ArrowRight size={18} /></>
              ) : (
                <>Create account <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '16px', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            <BadgeCheck size={13} style={{ color: 'var(--emerald-ink)' }} />
            Server-verified sessions · rate-limited · lockout protected
          </div>

          {onOpenAdmin && (
            <div
              style={{
                marginTop: '14px',
                textAlign: 'center',
                paddingTop: '14px',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <button
                type="button"
                className="btn btn-subtle btn-sm"
                style={{ fontSize: '0.78rem', gap: '6px' }}
                onClick={onOpenAdmin}
              >
                <ShieldCheck size={13} style={{ color: 'var(--indigo-ink)' }} /> Superadmin console
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
