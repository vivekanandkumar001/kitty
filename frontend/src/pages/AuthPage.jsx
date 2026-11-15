import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../theme';
import Logo from '../components/Logo';
import {
  Phone,
  User as UserIcon,
  KeyRound,
  ShieldCheck,
  Zap,
  ArrowRight,
  Repeat,
  Scale,
  Lock,
  BadgeCheck,
  Landmark,
  Sun,
  Moon,
  MessageSquare,
  AlertCircle,
  ShieldEllipsis,
  Pencil,
} from 'lucide-react';

const PHONE_RE = /^\d{10,15}$/;

export default function AuthPage({ onOpenAdmin }) {
  const { requestOtp, verifyOtp, login, signup } = useAuth();
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();

  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [step, setStep] = useState('identify'); // 'identify' | 'verify'

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [otpInvalid, setOtpInvalid] = useState(false);
  const [demoCode, setDemoCode] = useState(null);
  const [resendIn, setResendIn] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Legacy PIN fallback — keeps pre-OTP accounts and unconfigured
  // SMS deployments usable. OTP remains the default.
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);

  const boxRefs = useRef([]);

  // Resend countdown
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const clearOtp = () => {
    setCode(['', '', '', '', '', '']);
    setOtpError('');
    setOtpInvalid(false);
  };

  const resetToIdentify = () => {
    setStep('identify');
    clearOtp();
    setDemoCode(null);
  };

  const validateIdentify = () => {
    const errors = {};
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (mode === 'signup' && name.trim().length < 2) {
      errors.name = 'Enter your name (at least 2 characters).';
    }
    if (!cleanPhone) {
      errors.phone = 'Enter your mobile number.';
    } else if (!PHONE_RE.test(cleanPhone)) {
      errors.phone = 'Mobile number must be 10–15 digits.';
    }
    setFieldErrors(errors);
    return { valid: Object.keys(errors).length === 0, cleanPhone };
  };

  const sendOtp = async (targetPhone, targetPurpose) => {
    setSending(true);
    try {
      const res = await requestOtp(targetPhone, targetPurpose);
      setResendIn(res?.resend_after ?? 30);
      setDemoCode(res?.demo ? res.dev_otp : null);
      return res;
    } finally {
      setSending(false);
    }
  };

  const handleIdentifySubmit = async (e) => {
    e.preventDefault();
    const { valid, cleanPhone } = validateIdentify();
    if (!valid) return;

    try {
      await sendOtp(cleanPhone, mode);
      setStep('verify');
      clearOtp();
      showToast(
        mode === 'signup' ? 'Code sent — verify to create your account' : 'Code sent — welcome back!',
        'success'
      );
      // Focus first box after the panel swap animation
      window.setTimeout(() => boxRefs.current[0]?.focus(), 80);
    } catch (err) {
      const msg = err.message || 'Could not send the code';
      showToast(msg, 'error');
      // Surface server-side field feedback inline when possible
      if (/registered|already/i.test(msg)) setFieldErrors({ phone: msg });
    }
  };

  const focusBox = (i) => boxRefs.current[i]?.focus();

  const handleBoxChange = (index, rawValue) => {
    const digit = rawValue.replace(/\D/g, '').slice(-1);
    setCode((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    setOtpError('');
    setOtpInvalid(false);
    if (digit && index < 5) focusBox(index + 1);
  };

  const handleBoxKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (code[index]) {
        setCode((prev) => {
          const next = [...prev];
          next[index] = '';
          return next;
        });
      } else if (index > 0) {
        focusBox(index - 1);
        setCode((prev) => {
          const next = [...prev];
          next[index - 1] = '';
          return next;
        });
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === 'ArrowRight' && index < 5) {
      e.preventDefault();
      focusBox(index + 1);
    }
  };

  const handleBoxPaste = (e) => {
    const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    pasted.split('').forEach((d, i) => (next[i] = d));
    setCode(next);
    setOtpError('');
    setOtpInvalid(false);
    focusBox(Math.min(pasted.length, 5));
  };

  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    const joined = code.join('');
    if (joined.length !== 6) {
      setOtpError('Enter all 6 digits.');
      setOtpInvalid(true);
      return;
    }

    setVerifying(true);
    try {
      await verifyOtp(phone.trim().replace(/\D/g, ''), mode, joined, mode === 'signup' ? name.trim() : undefined);
      showToast(mode === 'signup' ? 'Account created — welcome to Kitty!' : 'Welcome back!', 'success');
    } catch (err) {
      const msg = err.message || 'Verification failed';
      setOtpError(msg);
      setOtpInvalid(true);
      showToast(msg, 'error');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || sending) return;
    try {
      const res = await sendOtp(phone.trim().replace(/\D/g, ''), mode);
      clearOtp();
      showToast('New code sent', 'info');
      if (res?.demo) showToast(`Demo OTP: ${res.dev_otp}`, 'info');
      focusBox(0);
    } catch (err) {
      showToast(err.message || 'Could not resend the code', 'error');
    }
  };

  const filledCount = code.filter(Boolean).length;

  // Legacy PIN submit (fallback path)
  const handlePinSubmit = async (e) => {
    e.preventDefault();
    const { valid, cleanPhone } = validateIdentify();
    const pinValid = /^\d{4}$/.test(pin);
    if (!valid || !pinValid) {
      if (!pinValid) setFieldErrors((p) => ({ ...p, pin: 'PIN must be exactly 4 digits.' }));
      return;
    }
    setPinSubmitting(true);
    try {
      if (mode === 'signup') {
        await signup(name.trim(), cleanPhone, pin);
        showToast('Account created — welcome to Kitty!', 'success');
      } else {
        await login(cleanPhone, pin);
        showToast('Welcome back!', 'success');
      }
    } catch (err) {
      showToast(err.message || 'Authentication failed', 'error');
    } finally {
      setPinSubmitting(false);
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
            <span className="check-dot"><MessageSquare size={13} strokeWidth={2.5} /></span>
            <span>
              <strong>Passwordless, SMS-OTP sign-in</strong> — no PINs, no passwords to forget.
              One 6-digit code and you&apos;re in.
            </span>
          </div>
        </div>

        <div className="auth-foot">
          <span><span className="mono">100%</span> integer-paise math</span>
          <span aria-hidden="true">·</span>
          <span><span className="mono">0</span> passwords</span>
          <span aria-hidden="true">·</span>
          <span><span className="mono">OTP</span> over SMS</span>
        </div>

        {/* Floating product shot — Wise-style device peeking from the hero edge */}
        <div className="hero-phone" aria-hidden="true">
          <div className="hero-phone-frame">
            <div className="hero-phone-screen">
              {/* status bar */}
              <div className="hp-status">
                <span className="mono">9:41</span>
                <span className="hp-status-icons"><i /><i /><i /></span>
              </div>
              {/* app bar */}
              <div className="hp-appbar">
                <span className="hp-cat" />
                <span className="hp-appbar-name">Flat 302</span>
                <span className="hp-chip">SILQW9</span>
              </div>
              {/* balance card */}
              <div className="hp-balance">
                <span className="hp-balance-label">Your room balance</span>
                <span className="hp-balance-value mono">+₹1,240</span>
                <span className="hp-badge mono">You get back</span>
              </div>
              {/* split bars */}
              <div className="hp-bars">
                <div className="hp-bar"><span style={{ width: '78%' }} /></div>
                <div className="hp-bar gold"><span style={{ width: '46%' }} /></div>
                <div className="hp-bar dim"><span style={{ width: '24%' }} /></div>
              </div>
              {/* ledger rows */}
              <div className="hp-row"><b>Groceries</b><span className="mono">₹1,840</span></div>
              <div className="hp-row"><b>Wifi · Nov</b><span className="mono">₹1,199</span></div>
              <div className="hp-row"><b>Maid</b><span className="mono">₹2,400</span></div>
            </div>
          </div>
          {/* floating settlement chip */}
          <div className="hp-float mono">Rahul → you · ₹450 <em>UPI ✓</em></div>
        </div>
      </aside>

      {/* ── Right: auth card ─────────────────────────────────────── */}
      <div className="auth-form-pane">
        {/* Mobile-only compact brand strip (hero is hidden on phones) */}
        <div className="auth-mobile-brand">
          <Logo size={44} className="logo-mark" />
          <div>
            <div className="auth-mobile-name">Kitty</div>
            <div className="auth-mobile-tag">Shared living, settled to the paisa</div>
          </div>
        </div>

        <div className="auth-card">
          <div className="step-dots" aria-hidden="true">
            <span className={`step-dot ${step === 'identify' ? 'active' : ''}`} />
            <span className={`step-dot ${step === 'verify' ? 'active' : ''}`} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <Logo size={46} className="logo-mark" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em' }}>
                {step === 'identify'
                  ? mode === 'login' ? 'Sign in to Kitty' : 'Create your Kitty ID'
                  : 'Check your SMS'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {step === 'identify'
                  ? mode === 'login' ? 'Your rooms are waiting.' : 'Free forever. No card required.'
                  : `Code sent to +91 ${phone.replace(/\D/g, '')}`}
              </div>
            </div>
          </div>

          {step === 'identify' && (
            <>
              {/* Mode switcher */}
              <div className="segmented" role="tablist" aria-label="Authentication mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
                  className={`segmented-btn ${mode === 'login' ? 'active' : ''}`}
                  onClick={() => { setMode('login'); setFieldErrors({}); }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signup'}
                  className={`segmented-btn ${mode === 'signup' ? 'active' : ''}`}
                  onClick={() => { setMode('signup'); setFieldErrors({}); }}
                >
                  New Account
                </button>
              </div>

              <form onSubmit={showPin ? handlePinSubmit : handleIdentifySubmit} noValidate>
                {mode === 'signup' && (
                  <div className="form-group">
                    <label htmlFor="auth-name">Full Name</label>
                    <div className="input-icon-wrap">
                      <input
                        id="auth-name"
                        type="text"
                        className={`form-control ${fieldErrors.name ? 'invalid' : ''}`}
                        placeholder="e.g. Vivekanand Kumar"
                        value={name}
                        autoComplete="name"
                        onChange={(e) => {
                          setName(e.target.value);
                          setFieldErrors((p) => ({ ...p, name: undefined }));
                        }}
                        required
                      />
                      <UserIcon size={17} />
                    </div>
                    {fieldErrors.name && (
                      <div className="field-error"><AlertCircle size={12} /> {fieldErrors.name}</div>
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="auth-phone">Mobile Number</label>
                  <div className="phone-input-wrap">
                    <span className="phone-prefix"><Phone size={13} /> +91</span>
                    <input
                      id="auth-phone"
                      type="tel"
                      className={`form-control mono ${fieldErrors.phone ? 'invalid' : ''}`}
                      placeholder="98765 43210"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 15));
                        setFieldErrors((p) => ({ ...p, phone: undefined }));
                      }}
                      autoComplete="tel"
                      inputMode="numeric"
                      maxLength={15}
                      required
                    />
                  </div>
                  {fieldErrors.phone ? (
                    <div className="field-error"><AlertCircle size={12} /> {fieldErrors.phone}</div>
                  ) : (
                    <div className="form-hint">We&apos;ll text a 6-digit code. Number is never shown to other members.</div>
                  )}
                </div>

                {showPin && (
                  <div className="form-group">
                    <label htmlFor="auth-pin">4-Digit Security PIN</label>
                    <div className="input-icon-wrap">
                      <input
                        id="auth-pin"
                        type="password"
                        className={`form-control mono ${fieldErrors.pin ? 'invalid' : ''}`}
                        placeholder="••••"
                        value={pin}
                        onChange={(e) => {
                          setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                          setFieldErrors((p) => ({ ...p, pin: undefined }));
                        }}
                        maxLength={4}
                        inputMode="numeric"
                        autoComplete="current-password"
                        required
                      />
                      <KeyRound size={17} />
                    </div>
                    {fieldErrors.pin && (
                      <div className="field-error"><AlertCircle size={12} /> {fieldErrors.pin}</div>
                    )}
                    <div className="form-hint">Legacy sign-in for accounts created before OTP.</div>
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%', marginTop: '4px' }}
                  disabled={sending || pinSubmitting}
                >
                  {showPin ? (
                    pinSubmitting ? 'Verifying…' : mode === 'signup' ? 'Create account' : 'Sign in'
                  ) : sending ? (
                    'Sending code…'
                  ) : (
                    <>Send OTP <ArrowRight size={18} /></>
                  )}
                </button>
              </form>

              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setShowPin((v) => !v);
                    setFieldErrors({});
                    setPin('');
                  }}
                >
                  {showPin
                    ? '← Back to OTP sign-in'
                    : mode === 'login'
                      ? "SMS not working? Use your 4-digit PIN"
                      : 'Prefer not to use SMS? Sign up with a PIN'}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '16px', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                <BadgeCheck size={13} style={{ color: 'var(--emerald-ink)' }} />
                One-time codes · expire in 5 minutes · never shared
              </div>
            </>
          )}

          {step === 'verify' && (
            <>
              {demoCode && (
                <div className="demo-banner" role="status">
                  <ShieldEllipsis size={16} style={{ flexShrink: 0 }} />
                  <span>
                    <strong>Demo mode</strong> — no SMS provider configured.<br />
                    Your code is <span className="mono">{demoCode}</span>
                  </span>
                </div>
              )}

              <div className="verify-head">
                <div className="verify-dest">+91 {phone.replace(/\D/g, '')}</div>
                <button
                  type="button"
                  className="link-btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}
                  onClick={resetToIdentify}
                >
                  <Pencil size={12} /> Change number
                </button>
              </div>

              <form onSubmit={handleVerifySubmit} noValidate>
                <div className="otp-row" role="group" aria-label="6-digit verification code">
                  {code.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => (boxRefs.current[i] = el)}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      autoComplete={i === 0 ? 'one-time-code' : 'off'}
                      className={`otp-box ${digit ? 'filled' : ''} ${otpInvalid ? 'invalid' : ''}`}
                      value={digit}
                      onChange={(e) => handleBoxChange(i, e.target.value)}
                      onKeyDown={(e) => handleBoxKeyDown(i, e)}
                      onPaste={handleBoxPaste}
                      onFocus={(e) => e.target.select()}
                      aria-label={`Digit ${i + 1}`}
                    />
                  ))}
                </div>

                {otpError && (
                  <div className="field-error" role="alert" style={{ justifyContent: 'center', marginTop: '10px' }}>
                    <AlertCircle size={12} /> {otpError}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%', marginTop: '16px' }}
                  disabled={verifying || filledCount !== 6}
                >
                  {verifying ? (
                    'Verifying…'
                  ) : (
                    <>{mode === 'signup' ? 'Verify & create account' : 'Verify & sign in'} <ArrowRight size={18} /></>
                  )}
                </button>
              </form>

              <div className="otp-meta">
                <span>Didn&apos;t get the code?</span>
                <button
                  type="button"
                  className="link-btn"
                  onClick={handleResend}
                  disabled={resendIn > 0 || sending}
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : sending ? 'Sending…' : 'Resend OTP'}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '12px', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                <Lock size={11} /> 5 attempts per code · codes hashed at rest · 5-minute expiry
              </div>
            </>
          )}

          {onOpenAdmin && step === 'identify' && (
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
