import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export function LoginScreen({ onLogin, onRegisterLink }: { onLogin?: () => void; onRegisterLink?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      onLogin?.();
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">Archigent</div>
        <form onSubmit={handleLogin}>
          <h2 className="auth-title">Sign In</h2>
          <input
            type="email"
            className="auth-input"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            type="password"
            className="auth-input"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          {error && <div className="auth-error">{error}</div>}
          {onLogin && onRegisterLink && (
            <button type="button" onClick={onRegisterLink} className="switch-auth" style={{ marginTop: '1rem' }}>
              Don&apos;t have an account? Register
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export function SetPasswordScreen({ onComplete }: { onComplete?: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      onComplete?.();
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">Archigent</div>
        <form onSubmit={handleSetPassword}>
          <h2 className="auth-title">Set Your Password</h2>
          <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>
            Welcome! Please create a password to complete your account setup.
          </p>
          <input
            type="password"
            className="auth-input"
            placeholder="New password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
          />
          <input
            type="password"
            className="auth-input"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Setting password...' : 'Set Password'}
          </button>
          {error && <div className="auth-error">{error}</div>}
        </form>
      </div>
    </div>
  );
}

const INDUSTRIES = [
  "Financial Services",
  "Healthcare",
  "Retail & E-commerce",
  "Technology",
  "Manufacturing",
  "Telecommunications",
  "Energy & Utilities",
  "Government",
  "Education",
  "Media & Entertainment",
  "Other",
];

export function RegistrationScreen({ onRegister, onLoginLink }: { onRegister?: () => void; onLoginLink?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [industry, setIndustry] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    setError('');

    // 1. Create auth user
    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, org_name: orgName, industry },
      },
    });
    if (signupError) {
      setError(signupError.message);
      setLoading(false);
      return;
    }

    const userId = signupData.user?.id;
    if (!userId) {
      setError('Signup succeeded but no user ID returned');
      setLoading(false);
      return;
    }

    // 2. Create org + profile + org_members via API
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          email,
          full_name: fullName || null,
          org_name: orgName,
          industry: industry || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to create organisation');
        setLoading(false);
        return;
      }
    } catch {
      setError('Failed to create organisation');
      setLoading(false);
      return;
    }

    setLoading(false);
    onRegister?.();
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">Archigent</div>
        <form onSubmit={handleRegister}>
          <h2 className="auth-title">Create Account</h2>
          <input
            type="text"
            className="auth-input"
            placeholder="Full name"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            autoComplete="name"
          />
          <input
            type="email"
            className="auth-input"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            type="password"
            className="auth-input"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
          />
          <input
            type="text"
            className="auth-input"
            placeholder="Organisation name"
            value={orgName}
            onChange={e => setOrgName(e.target.value)}
            required
          />
          <select
            className="auth-input"
            value={industry}
            onChange={e => setIndustry(e.target.value)}
          >
            <option value="">Industry (optional)</option>
            {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
          <button type="submit" className="auth-button" disabled={loading || !orgName.trim()}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
          {error && <div className="auth-error">{error}</div>}
          {onLoginLink && (
            <button type="button" onClick={onLoginLink} className="switch-auth" style={{ marginTop: '1rem' }}>
              Already have an account? Sign In
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
