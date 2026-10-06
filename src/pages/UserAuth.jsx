import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, AtSign, CheckCircle2, Code2, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { setRememberSession } from '../lib/auth-storage.js';
import { requireSupabase } from '../lib/supabase.js';
import { isUsernameAvailable, resolveAccountRole, validateUsername } from '../lib/profile.js';
import '../styles/auth.css';

function AuthLayout({ eyebrow, title, subtitle, children }) {
  return <main className="user-auth-page">
    <header className="user-auth-header">
      <Link className="user-auth-logo" to="/" aria-label="Kishan C home">KISHAN<span>.</span></Link>
      <Link className="user-auth-back" to="/"><ArrowLeft size={15} /> Back to portfolio</Link>
    </header>
    <section className="user-auth-card">
      <span className="user-auth-mark"><Code2 size={20} /></span>
      <span className="user-auth-eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p className="user-auth-subtitle">{subtitle}</p>
      {children}
      <div className="user-auth-secure"><ShieldCheck size={14} /> Secure login with Supabase</div>
    </section>
    <footer className="user-auth-footer">
      <span>© {new Date().getFullYear()} KISHAN C.</span>
      <Link to="/">Back to portfolio</Link>
    </footer>
  </main>;
}

function PasswordInput({ id, label, value, onChange, autoComplete, minLength }) {
  const [visible, setVisible] = useState(false);
  const ToggleIcon = visible ? EyeOff : Eye;
  return <label className="user-auth-field" htmlFor={id}>
    <span>{label}</span>
    <span className="user-auth-input-wrap">
      <LockKeyhole size={16} />
      <input id={id} type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} minLength={minLength} required placeholder={label.includes('Confirm') ? 'Re-enter your password' : 'Enter your password'} />
      <button type="button" onClick={() => setVisible((current) => !current)} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}><ToggleIcon size={16} /></button>
    </span>
  </label>;
}

function LoginIdentifierInput({ id, value, onChange }) {
  return <label className="user-auth-field" htmlFor={id}>
    <span>Email or username</span>
    <span className="user-auth-input-wrap">
      <AtSign size={16} />
      <input id={id} type="text" value={value} onChange={onChange} autoComplete="username" required placeholder="you@example.com or @username" />
    </span>
  </label>;
}

function EmailInput({ id, value, onChange, autoComplete = 'email' }) {
  return <label className="user-auth-field" htmlFor={id}>
    <span>Email address</span>
    <span className="user-auth-input-wrap">
      <Mail size={16} />
      <input id={id} type="email" value={value} onChange={onChange} autoComplete={autoComplete} required placeholder="you@example.com" />
    </span>
  </label>;
}

function AuthMessage({ children, success = false }) {
  if (!children) return null;
  const Icon = success ? CheckCircle2 : ShieldCheck;
  return <div className={`user-auth-message${success ? ' success' : ''}`} role="status"><Icon size={16} />{children}</div>;
}

async function usernameLoginErrorMessage(error) {
  const context = error?.context;
  if (context instanceof Response) {
    if (context.status === 404) {
      return 'Username login is not deployed yet. Deploy the login-with-username Supabase function and try again.';
    }
    try {
      const body = await context.clone().json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // Use the status-specific fallback when the gateway response is not JSON.
    }
    if (context.status === 401) {
      return 'Username or password is incorrect. If you just deployed username login, wait briefly and try again.';
    }
    return `Username login failed (HTTP ${context.status}). Check the Supabase function deployment and logs.`;
  }
  if (error?.name === 'FunctionsFetchError') {
    return 'Could not reach username login. Check your connection and confirm the Supabase function is deployed.';
  }
  return error?.message || 'Unable to log in with that username. Please try again.';
}

function GoogleMark() {
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.61 24.45c0-1.42-.13-2.78-.36-4.09H24v7.75h11c-.47 2.49-1.87 4.6-3.97 6.02v5.04h6.45c3.78-3.48 6.13-8.6 6.13-14.72Z" /><path fill="#34A853" d="M24 44c5.4 0 9.92-1.79 13.23-4.83l-6.45-5.04c-1.79 1.2-4.08 1.92-6.78 1.92-5.22 0-9.65-3.52-11.23-8.26H6.1v5.2C9.4 39.55 16.16 44 24 44Z" /><path fill="#FBBC05" d="M12.77 27.79A12.08 12.08 0 0 1 12.14 24c0-1.32.23-2.6.63-3.79v-5.2H6.1A19.97 19.97 0 0 0 4 24c0 3.23.77 6.28 2.1 8.99l6.67-5.2Z" /><path fill="#EA4335" d="M24 11.95c2.94 0 5.58 1.01 7.66 3l5.75-5.75C33.9 5.98 29.4 4 24 4 16.16 4 9.4 8.45 6.1 15.01l6.67 5.2c1.58-4.74 6.01-8.26 11.23-8.26Z" /></svg>;
}

function GoogleSignInButton({ pending, onClick }) {
  return <button className="user-auth-google" type="button" onClick={onClick} disabled={pending}>
    {pending ? <LoaderCircle className="spin" size={17} /> : <GoogleMark />}
    Continue with Google
  </button>;
}

async function startGoogleAuth(setPending, setMessage) {
  setPending(true);
  setMessage('');
  setRememberSession(true);
  try {
    const { error } = await requireSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
  } catch (error) {
    setMessage(error.message || 'Unable to continue with Google. Please try again.');
    setPending(false);
  }
}

export function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    setSuccess(false);
    setRememberSession(true);
    try {
      const supabase = requireSupabase();
      const identifier = email.trim();
      let data;
      if (identifier.includes('@')) {
        const result = await supabase.auth.signInWithPassword({ email: identifier, password });
        if (result.error) throw result.error;
        data = result.data;
      } else {
        const username = identifier.replace(/^@/, '').toLowerCase();
        const { data: result, error } = await supabase.functions.invoke('login-with-username', {
          body: { username, password },
        });
        if (error) throw new Error(await usernameLoginErrorMessage(error));
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: result?.session?.access_token || '',
          refresh_token: result?.session?.refresh_token || '',
        });
        if (sessionError) throw sessionError;
        data = { user: sessionData.user };
      }
      if (!data.user) throw new Error('Sign-in did not return an authenticated user.');
      try {
        const role = await resolveAccountRole(data.user);
        setSuccess(true);
        navigate(location.state?.from?.pathname || (role === 'admin' ? '/admin' : '/'), { replace: true });
      } catch (profileError) {
        await requireSupabase().auth.signOut();
        throw new Error(`Unable to verify your account profile: ${profileError.message}`);
      }
    } catch (error) {
      setMessage(error.message === 'Invalid login credentials'
        ? 'Email or password is incorrect.'
        : error.message || 'Unable to log in. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return <AuthLayout eyebrow="YOUR ACCOUNT · LOGIN" title="Welcome back." subtitle="Log in to continue to your account.">
    <AuthMessage success={success}>{message}</AuthMessage>
    <form className="user-auth-form" onSubmit={submit}>
      <LoginIdentifierInput id="user-signin-email" value={email} onChange={(event) => setEmail(event.target.value)} />
      <PasswordInput id="user-signin-password" label="Password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
      <div className="user-auth-options"><span /> <Link to="/forgot-password">Forgot password?</Link></div>
      <button className="user-auth-submit" type="submit" disabled={pending}>{pending ? <><LoaderCircle className="spin" size={17} /> Logging in…</> : <>Login <ArrowRight size={16} /></>}</button>
    </form>
    <div className="user-auth-divider"><span /> OR CONTINUE WITH <span /></div>
    <GoogleSignInButton pending={pending} onClick={() => startGoogleAuth(setPending, setMessage)} />
    <p className="user-auth-switch">Don’t have an account? <Link to="/register">Create one <ArrowRight size={14} /></Link></p>
  </AuthLayout>;
}

export function RegisterPage() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setSuccess(false);
    if (password !== confirmPassword) {
      setMessage('Your passwords do not match.');
      return;
    }
    let normalizedUsername;
    try {
      normalizedUsername = validateUsername(username);
    } catch (validationError) {
      setMessage(validationError.message);
      return;
    }
    setPending(true);
    try {
      if (!await isUsernameAvailable(normalizedUsername)) {
        throw new Error('Username is already taken.');
      }
      const { data, error } = await requireSupabase().auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim(), username: normalizedUsername }, emailRedirectTo: `${window.location.origin}/signin` },
      });
      if (error) throw error;
      if (data.session && data.user) {
        try {
          await resolveAccountRole(data.user);
        } catch (profileError) {
          await requireSupabase().auth.signOut();
          throw new Error(`Your account was created, but its profile could not be verified: ${profileError.message}`);
        }
        navigate('/', { replace: true });
        return;
      }
      setSuccess(true);
      setMessage('Your account was created. Check your email to confirm it, then log in.');
    } catch (error) {
      setMessage(error.message || 'Unable to create your account. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return <AuthLayout eyebrow="YOUR ACCOUNT · CREATE ACCOUNT" title="Create your account." subtitle="Join the community and get started.">
    <AuthMessage success={success}>{message}</AuthMessage>
    <form className="user-auth-form" onSubmit={submit}>
      <label className="user-auth-field" htmlFor="user-register-name">
        <span>Full name</span>
        <span className="user-auth-input-wrap"><UserRound size={16} /><input id="user-register-name" type="text" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={80} required placeholder="Your name" /></span>
      </label>
      <label className="user-auth-field" htmlFor="user-register-username">
        <span>Username</span>
        <span className="user-auth-input-wrap"><span aria-hidden="true">@</span><input id="user-register-username" type="text" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" minLength={3} maxLength={30} pattern="[A-Za-z0-9_.]{3,30}" required placeholder="your.handle" /></span>
      </label>
      <p className="user-auth-field-hint">3–30 characters · letters, numbers, periods, underscores</p>
      <EmailInput id="user-register-email" value={email} onChange={(event) => setEmail(event.target.value)} />
      <PasswordInput id="user-register-password" label="Password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} />
      <PasswordInput id="user-register-confirm" label="Confirm password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} />
      <button className="user-auth-submit" type="submit" disabled={pending}>{pending ? <><LoaderCircle className="spin" size={17} /> Creating account…</> : <>Create Account <ArrowRight size={16} /></>}</button>
    </form>
    <div className="user-auth-divider"><span /> OR SIGN UP WITH <span /></div>
    <GoogleSignInButton pending={pending} onClick={() => startGoogleAuth(setPending, setMessage)} />
    <p className="user-auth-switch">Already have an account? <Link to="/signin">Log in <ArrowRight size={14} /></Link></p>
  </AuthLayout>;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    setSuccess(false);
    try {
      const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
      if (error) throw error;
      setSuccess(true);
      setMessage('If an account exists for this email, a password reset link has been sent.');
    } catch (error) {
      setMessage(error.message || 'Unable to send a password reset email.');
    } finally {
      setPending(false);
    }
  }

  return <AuthLayout eyebrow="ACCOUNT RECOVERY" title="Reset password." subtitle="Enter your email and we’ll send you a secure reset link.">
    <AuthMessage success={success}>{message}</AuthMessage>
    <form className="user-auth-form" onSubmit={submit}>
      <EmailInput id="user-forgot-email" value={email} onChange={(event) => setEmail(event.target.value)} />
      <button className="user-auth-submit" type="submit" disabled={pending}>{pending ? <><LoaderCircle className="spin" size={17} /> Sending…</> : <>Send reset link <ArrowRight size={16} /></>}</button>
    </form>
    <p className="user-auth-switch"><Link to="/signin"><ArrowLeft size={14} /> Back to login</Link></p>
  </AuthLayout>;
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setSuccess(false);
    if (password !== confirmPassword) {
      setMessage('Your passwords do not match.');
      return;
    }
    setPending(true);
    try {
      const { error } = await requireSupabase().auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setMessage('Your password was updated. You can now log in.');
    } catch (error) {
      setMessage(error.message || 'Unable to update your password. Request a new reset link.');
    } finally {
      setPending(false);
    }
  }

  return <AuthLayout eyebrow="ACCOUNT RECOVERY" title="Choose a new password." subtitle="Use at least 8 characters for your new password.">
    <AuthMessage success={success}>{message}</AuthMessage>
    {success ? <button className="user-auth-submit" type="button" onClick={() => navigate('/signin', { replace: true })}>Continue to login <ArrowRight size={16} /></button> : <form className="user-auth-form" onSubmit={submit}>
      <PasswordInput id="user-reset-password" label="New password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} />
      <PasswordInput id="user-reset-confirm" label="Confirm password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} />
      <button className="user-auth-submit" type="submit" disabled={pending}>{pending ? <><LoaderCircle className="spin" size={17} /> Updating…</> : <>Update password <ArrowRight size={16} /></>}</button>
    </form>}
  </AuthLayout>;
}

export function UserAuthCallback() {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    async function completeSignIn() {
      try {
        const callbackError = new URLSearchParams(window.location.search).get('error_description');
        if (callbackError) throw new Error(callbackError);
        const { data, error } = await requireSupabase().auth.getSession();
        if (error) throw error;
        if (!data.session?.user) throw new Error('Google sign-in did not return an active session. Please try again.');
        await resolveAccountRole(data.session.user);
        if (active) navigate('/', { replace: true });
      } catch (error) {
        try {
          await requireSupabase().auth.signOut();
        } catch (signOutError) {
          if (active) {
            setMessage(`${error.message || 'Unable to verify your account.'} Also unable to end the unverified session: ${signOutError.message}`);
            setPending(false);
          }
          return;
        }
        if (active) {
          setMessage(error.message || 'Unable to verify your account. Please try again.');
          setPending(false);
        }
      }
    }
    completeSignIn();
    return () => { active = false; };
  }, [navigate]);

  return <AuthLayout eyebrow="GOOGLE SIGN IN" title={pending ? 'Finishing sign-in.' : 'Sign-in could not be completed.'} subtitle={pending ? 'Verifying your account securely.' : 'Please try again or use email and password.'}>
    {!pending && <AuthMessage>{message}</AuthMessage>}
    {pending && <div className="user-auth-callback-loading"><LoaderCircle className="spin" size={18} /> Verifying your account</div>}
    <p className="user-auth-switch"><Link to="/signin">Back to login <ArrowRight size={14} /></Link></p>
  </AuthLayout>;
}
