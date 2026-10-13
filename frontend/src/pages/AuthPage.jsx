import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
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
} from 'lucide-react';

export default function AuthPage({ onOpenAdmin }) {
  const { login, signup } = useAuth();
  const { showToast } = useToast();

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
    <div
      style={{
        minHeight: 'calc(100vh - 68px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '30px 20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '920px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '30px',
          alignItems: 'center',
        }}
      >
        {/* Left Column: Hero & Value Prop */}
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              background: 'var(--emerald-subtle)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 'var(--radius-full)',
              color: 'var(--emerald-ink)',
              fontSize: '0.82rem',
              fontWeight: 600,
              marginBottom: '20px',
            }}
          >
            <Zap size={14} /> Shared flat expense tracker
          </div>

          <h1
            style={{
              fontSize: 'clamp(2rem, 5vw, 2.8rem)',
              lineHeight: 1.15,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              margin: '0 0 16px',
            }}
          >
            Split expenses with roommates{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #10B981 0%, #6366F1 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              without the headache.
            </span>
          </h1>

          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '1.05rem',
              lineHeight: 1.6,
              marginBottom: '28px',
            }}
          >
            Log rent, electricity, groceries and maid bills once. Kitty calculates
            exact balances with mathematical debt simplification and one-tap UPI settlement.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--emerald-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--emerald-ink)',
                }}
              >
                <Zap size={17} />
              </div>
              <span style={{ fontSize: '0.92rem', color: 'var(--text-main)', fontWeight: 500 }}>
                Smart debt simplification (minimum transactions)
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--indigo-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--indigo-ink)',
                }}
              >
                <Repeat size={17} />
              </div>
              <span style={{ fontSize: '0.92rem', color: 'var(--text-main)', fontWeight: 500 }}>
                Monthly recurring templates for rent & wifi bills
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--amber-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--amber-ink)',
                }}
              >
                <Receipt size={17} />
              </div>
              <span style={{ fontSize: '0.92rem', color: 'var(--text-main)', fontWeight: 500 }}>
                Custom splits: equal, exact paise, percentage, attendance
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Auth Card */}
        <div className="card" style={{ padding: '32px' }}>
          {/* Mode Switcher */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px',
              marginBottom: '24px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <button
              type="button"
              className={`tab-btn ${mode === 'login' ? 'active' : ''}`}
              style={{ justifyContent: 'center', padding: '9px' }}
              onClick={() => setMode('login')}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`tab-btn ${mode === 'signup' ? 'active' : ''}`}
              style={{ justifyContent: 'center', padding: '9px' }}
              onClick={() => setMode('signup')}
            >
              New Account
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div className="form-group">
                <label htmlFor="auth-name">Your Full Name</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="auth-name"
                    type="text"
                    className="form-control"
                    placeholder="e.g. Jordan Lee"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <UserIcon
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
              </div>
            )}

            <div className="form-group">
              <label htmlFor="auth-phone">Mobile Number</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="auth-phone"
                  type="tel"
                  className="form-control"
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  maxLength={15}
                  required
                />
                <Phone
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
              <div className="form-hint">Used to identify you in your shared rooms</div>
            </div>

            <div className="form-group">
              <label htmlFor="auth-pin">4-Digit Security PIN</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="auth-pin"
                  type="password"
                  className="form-control mono"
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  maxLength={4}
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
              <div className="form-hint">Simple PIN for quick phone sign-in</div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '10px' }}
              disabled={loading}
            >
              {loading ? (
                'Processing...'
              ) : mode === 'login' ? (
                <>
                  Sign In to Kitty <ArrowRight size={18} />
                </>
              ) : (
                <>
                  Create Account <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {onOpenAdmin && (
            <div
              style={{
                marginTop: '18px',
                textAlign: 'center',
                paddingTop: '14px',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <button
                type="button"
                className="btn btn-subtle btn-sm"
                style={{ fontSize: '0.8rem', color: 'var(--text-dim)', gap: '6px' }}
                onClick={onOpenAdmin}
              >
                <ShieldCheck size={14} style={{ color: 'var(--indigo-ink)' }} /> Superadmin Portal
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
