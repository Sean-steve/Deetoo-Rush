import { useState, type FormEvent } from 'react';
import './password-recovery.css';

/**
 * Shared unauthenticated recovery flow for the Customer, Merchant and Admin portals.
 * No account existence, token or password is persisted in browser storage.
 */
async function authPost(path: string, body: Record<string, string>): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/api/v1/auth' + path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('DeeToo is unreachable. Check your connection and try again.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const reason = data?.error?.message;
    throw new Error(typeof reason === 'string' && reason ? reason : response.status === 429
      ? 'Too many attempts. Please try again later.'
      : 'Recovery could not be completed. Please try again.');
  }
}

export function PasswordRecovery({ initialIdentifier = '', onBack }: {
  initialIdentifier?: string;
  onBack: () => void;
}) {
  const [step, setStep] = useState<'request' | 'reset' | 'complete'>('request');
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function requestReset(event: FormEvent) {
    event.preventDefault();
    if (busy || !identifier.trim()) return;
    setBusy(true);
    setError('');
    try {
      await authPost('/password/forgot', { identifier: identifier.trim() });
      setStep('reset');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to request recovery.');
    } finally {
      setBusy(false);
    }
  }

  async function reset(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password.length < 8 || password.length > 128) {
      setError('Use a password between 8 and 128 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authPost('/password/reset', { token: token.trim(), new_password: password });
      setToken('');
      setPassword('');
      setConfirmation('');
      setStep('complete');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reset the password.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="dt-password-recovery" aria-label="Recover your DeeToo account">
    {step === 'request' && <form onSubmit={event => void requestReset(event)}>
      <p>Enter your registered email or phone number. We will send a secure recovery token if the account is eligible.</p>
      <label>Registered email or phone
        <input required autoComplete="username" value={identifier} onChange={event => setIdentifier(event.target.value)} />
      </label>
      <button type="submit" className="dt-recovery-primary" disabled={busy}>
        {busy ? 'Sending instructions…' : 'Send recovery instructions'}
      </button>
    </form>}
    {step === 'reset' && <form onSubmit={event => void reset(event)}>
      <p role="status">If an eligible account exists, check your email or SMS. The token expires after one hour.</p>
      <label>Recovery token
        <input required minLength={10} autoComplete="one-time-code" value={token}
          onChange={event => setToken(event.target.value)} />
      </label>
      <label>New password
        <input required minLength={8} maxLength={128} type={showPassword ? 'text' : 'password'}
          autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} />
      </label>
      <label>Confirm new password
        <input required minLength={8} maxLength={128} type={showPassword ? 'text' : 'password'}
          autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} />
      </label>
      <label className="dt-recovery-inline"><input type="checkbox" checked={showPassword}
        onChange={event => setShowPassword(event.target.checked)} /> Show passwords</label>
      <button type="submit" className="dt-recovery-primary" disabled={busy}>
        {busy ? 'Resetting…' : 'Reset password'}
      </button>
      <button className="dt-recovery-text" type="button" onClick={() => { setError(''); setStep('request'); }}>
        Request a different token
      </button>
    </form>}
    {step === 'complete' && <p role="status">Your password has been changed. All existing sessions were revoked. Sign in again with your new password.</p>}
    {error && <p className="dt-recovery-error" role="alert">{error}</p>}
    <button type="button" className="dt-recovery-text" onClick={onBack}>
      {step === 'complete' ? 'Return to sign in' : 'Back to sign in'}
    </button>
  </section>;
}

/** A post-registration verification prompt; account creation never depends on provider availability. */
export function ContactVerification({ identifier, onDone }: { identifier: string; onDone: () => void }) {
  const email = identifier.includes('@');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const path = email ? '/verify/email-otp-' : '/verify/otp-';
  const input = email ? { email: identifier.trim().toLowerCase() } : { phone_e164: identifier.trim() };
  const send = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      await authPost(path + 'request', input);
      setSent(true);
      setMessage('If this contact is eligible, a 6-digit verification code has been sent. It expires in 10 minutes.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Verification could not be requested.'); }
    finally { setBusy(false); }
  };
  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await authPost(path + 'confirm', { ...input, code });
      setCode('');
      onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid or expired verification code.'); }
    finally { setBusy(false); }
  };
  return <section className="dt-password-recovery" aria-label="Verify registered contact">
    <p>Verify your {email ? 'email' : 'phone number'} to protect your account: <strong>{identifier}</strong>.</p>
    <button className="dt-recovery-primary" type="button" disabled={busy} onClick={() => void send()}>
      {busy ? 'Please wait…' : sent ? 'Resend verification code' : 'Send verification code'}
    </button>
    {sent && <form onSubmit={event => void verify(event)}>
      <label>Six-digit verification code
        <input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
          value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
      </label>
      <button className="dt-recovery-primary" type="submit" disabled={busy || code.length !== 6}>Verify contact</button>
    </form>}
    {message && <p role="status">{message}</p>}
    {error && <p className="dt-recovery-error" role="alert">{error}</p>}
    <button type="button" className="dt-recovery-text" onClick={onDone}>Verify later</button>
  </section>;
}
