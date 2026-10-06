import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, CheckCircle2, CircleHelp, Clock3, ImagePlus, LoaderCircle,
  LogOut, Mail, Pencil, ShieldCheck, UserRound, X,
} from 'lucide-react';
import { supabaseConfigured } from '../lib/supabase-env.js';
import { requireSupabase } from '../lib/supabase.js';
import {
  AVATAR_MAX_BYTES, describeProfileError, ensureProfile, fetchProfile, updateProfile, uploadAvatar,
  isUsernameAvailable, validateUsername,
} from '../lib/profile.js';
import MyReviews from './MyReviews.jsx';
import '../styles/profile.css';

const NAME_LIMIT = 80;
const USERNAME_LIMIT = 30;
const BIO_LIMIT = 280;
const SIGN_IN_PATH = '/signin';

function initialFor(profile, session) {
  const source = profile?.full_name || profile?.username || session?.user?.email || 'K';
  const first = String(source).trim().charAt(0).toUpperCase();
  return first || 'K';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function handleFor(profile) {
  return profile?.username ? `@${profile.username}` : '@username-not-set';
}

export default function Profile() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('loading');
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: '', username: '', bio: '' });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const fileInputRef = useRef(null);
  const previewRef = useRef('');

  const releasePreview = () => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = '';
    }
  };

  // Restore the Supabase session and bounce visitors who are not signed in.
  useEffect(() => {
    if (!supabaseConfigured) return undefined;
    let active = true;
    let subscription;
    const supabase = requireSupabase();

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError(describeProfileError(sessionError));
        setStatus('error');
        return;
      }
      if (!data.session?.user) {
        navigate(SIGN_IN_PATH, { replace: true, state: { from: { pathname: '/profile' } } });
        return;
      }
      setSession(data.session);
    }).catch((sessionError) => {
      if (!active) return;
      setError(describeProfileError(sessionError));
      setStatus('error');
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active || event !== 'SIGNED_OUT') return;
      navigate(SIGN_IN_PATH, { replace: true });
    });
    subscription = data.subscription;

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [navigate]);

  // Load (or self-heal) the profile row for the signed-in user.
  useEffect(() => {
    if (!session?.user) return undefined;
    let active = true;
    setStatus('loading');
    setError('');
    ensureProfile(session.user).then((data) => {
      if (!active) return;
      setProfile(data);
      setForm({ full_name: data.full_name || '', username: data.username || '', bio: data.bio || '' });
      setStatus('ready');
    }).catch((loadError) => {
      if (!active) return;
      setError(describeProfileError(loadError));
      setStatus('error');
    });
    return () => { active = false; };
  }, [session?.user?.id, reloadKey]);

  useEffect(() => () => releasePreview(), []);

  useEffect(() => {
    if (!saveSuccess) return undefined;
    const timer = window.setTimeout(() => setSaveSuccess(''), 4200);
    return () => window.clearTimeout(timer);
  }, [saveSuccess]);

  function pickFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaveError('');
    if (!file.type.startsWith('image/')) {
      setSaveError('Please choose an image file (PNG, JPEG, WebP or AVIF).');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setSaveError('Profile pictures must be 3 MB or smaller.');
      return;
    }
    releasePreview();
    previewRef.current = URL.createObjectURL(file);
    setAvatarPreview(previewRef.current);
    setAvatarFile(file);
  }

  function startEditing() {
    setForm({ full_name: profile.full_name || '', username: profile.username || '', bio: profile.bio || '' });
    setSaveError('');
    setSaveSuccess('');
    setAvatarFile(null);
    releasePreview();
    setAvatarPreview('');
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setAvatarFile(null);
    releasePreview();
    setAvatarPreview('');
    setSaveError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (saving || !session?.user) return;
    setSaving(true);
    setSaveError('');
    setSaveSuccess('');
    try {
      const username = validateUsername(form.username);
      if (username !== profile.username && !await isUsernameAvailable(username)) {
        throw new Error('Username is already taken.');
      }
      let avatarUrl;
      if (avatarFile) avatarUrl = await uploadAvatar(session.user.id, avatarFile);
      const updates = { full_name: form.full_name, username, bio: form.bio };
      if (avatarUrl) updates.avatar_url = avatarUrl;
      await updateProfile(session.user.id, updates);
      // Re-read the row so the UI shows exactly what Supabase stored.
      const fresh = await fetchProfile(session.user.id);
      if (fresh) {
        setProfile(fresh);
        setForm({ full_name: fresh.full_name || '', username: fresh.username || '', bio: fresh.bio || '' });
      }
      setAvatarFile(null);
      releasePreview();
      setAvatarPreview('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setEditing(false);
      setSaveSuccess('Profile updated successfully.');
    } catch (saveFailure) {
      setSaveError(describeProfileError(saveFailure));
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setSaveError('');
    try {
      await requireSupabase().auth.signOut();
      navigate('/', { replace: true });
    } catch (logoutError) {
      setSaveError(describeProfileError(logoutError));
      setLoggingOut(false);
    }
  }

  const heading = (
    <div className="section-heading reveal">
      <p className="eyebrow">YOUR ACCOUNT · SUPABASE POWERED</p>
      <h2>Your profile<span>.</span></h2>
    </div>
  );

  if (!supabaseConfigured) {
    return (
      <section className="section container profile-section" id="profile">
        {heading}
        <div className="profile-message" role="alert">
          <CircleHelp size={16} />
          <span>Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your environment, then restart the app.</span>
        </div>
      </section>
    );
  }

  if (status === 'loading' || !session) {
    return (
      <section className="section container profile-section" id="profile">
        {heading}
        <div className="profile-grid" aria-live="polite" aria-busy="true">
          <div className="glass-card profile-skel-card">
            <div className="profile-skel profile-skel-avatar" />
            <div className="profile-skel profile-skel-line" style={{ width: '55%', margin: '0 auto' }} />
            <div className="profile-skel profile-skel-line" style={{ width: '35%', margin: '12px auto 0' }} />
            <div className="profile-skel profile-skel-line" style={{ width: '80%', margin: '20px auto 0' }} />
          </div>
          <div className="glass-card profile-skel-card">
            <div className="profile-skel profile-skel-line" style={{ width: '40%' }} />
            <div className="profile-skel profile-skel-line" style={{ height: 58, marginTop: 18 }} />
            <div className="profile-skel profile-skel-line" style={{ height: 58 }} />
            <div className="profile-skel profile-skel-line" style={{ height: 58 }} />
          </div>
        </div>
      </section>
    );
  }

  if (status === 'error' || !profile) {
    return (
      <section className="section container profile-section" id="profile">
        {heading}
        <div className="profile-message" role="alert">
          <CircleHelp size={16} />
          <span>We could not load your profile. {error}</span>
        </div>
        <div className="profile-form-actions">
          <button className="button button-primary" type="button" onClick={() => setReloadKey((key) => key + 1)}>Try again</button>
          <button className="button button-ghost" type="button" onClick={logout}>Log out</button>
        </div>
      </section>
    );
  }

  const avatarUrl = avatarPreview || profile.avatar_url;
  const roleLabel = profile.role === 'admin' ? 'Administrator' : 'Member';

  return (
    <section className="section container profile-section" id="profile">
      {heading}

      {saveSuccess && (
        <div className="profile-message success profile-enter" role="status">
          <CheckCircle2 size={16} /><span>{saveSuccess}</span>
        </div>
      )}

      <div className="profile-grid">
        <aside className="glass-card profile-card profile-enter">
          <div className="profile-avatar-wrap">
            {avatarUrl
              ? <img className="profile-avatar" src={avatarUrl} alt={`${profile.full_name || profile.username || 'Your'} avatar`} />
              : <span className="profile-avatar profile-avatar-fallback" aria-hidden="true">{initialFor(profile, session)}</span>}
            <button
              className="profile-avatar-edit"
              type="button"
              aria-label="Change profile picture"
              onClick={() => { if (!editing) startEditing(); fileInputRef.current?.click(); }}
            >
              <ImagePlus size={15} />
            </button>
          </div>
          <span className={`profile-role${profile.role === 'admin' ? ' is-admin' : ''}`}>
            <ShieldCheck size={12} />{roleLabel}
          </span>
          <h3>{profile.full_name || 'Add your full name'}</h3>
          <p className="profile-handle">{handleFor(profile)}</p>
          <p className={`profile-bio${profile.bio ? '' : ' is-empty'}`}>{profile.bio || 'You have not added a bio yet.'}</p>
          <div className="profile-meta"><Clock3 size={13} /> Member since {formatDate(profile.created_at)}</div>
          <div className="profile-actions">
            {editing
              ? <button className="button button-ghost" type="button" onClick={cancelEditing}><X size={15} /> Cancel</button>
              : <button className="button button-primary" type="button" onClick={startEditing}><Pencil size={15} /> Edit profile</button>}
            <button className="button button-ghost" type="button" onClick={logout} disabled={loggingOut}>
              {loggingOut ? <LoaderCircle className="profile-spin" size={15} /> : <LogOut size={15} />} {loggingOut ? 'Signing out…' : 'Log out'}
            </button>
          </div>
        </aside>

        <div className="glass-card profile-panel profile-enter">
          <p className="eyebrow">{editing ? 'EDITING PROFILE' : 'ACCOUNT DETAILS'}</p>
          <h3>{editing ? 'Update your details' : 'Profile information'}</h3>

          {!editing && (
            <div className="profile-details">
              <div className="profile-detail">
                <span><Mail size={12} /> Email</span>
                <b>{profile.email || session.user.email || '—'}</b>
                <em className="profile-lock">Managed by Supabase Auth</em>
              </div>
              <div className="profile-detail">
                <span><UserRound size={12} /> Username</span>
                <b>{profile.username ? `@${profile.username}` : 'Not set'}</b>
              </div>
              <div className="profile-detail">
                <span><ShieldCheck size={12} /> Role</span>
                <b>{roleLabel}</b>
                <em className="profile-lock">Only an administrator can change roles</em>
              </div>
              <div className="profile-detail">
                <span><Clock3 size={12} /> Account created</span>
                <b>{formatDate(profile.created_at)}</b>
              </div>
            </div>
          )}

          {editing && (
            <form className="profile-form" onSubmit={saveProfile}>
              {saveError && (
                <div className="profile-message" role="alert"><CircleHelp size={16} /><span>{saveError}</span></div>
              )}
              <label htmlFor="profile-full-name">Full name
                <span className="profile-input-wrap">
                  <UserRound size={15} />
                  <input id="profile-full-name" type="text" value={form.full_name} maxLength={NAME_LIMIT} autoComplete="name" placeholder="Your full name" onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} />
                </span>
              </label>
              <label htmlFor="profile-username">Username
                <span className="profile-input-wrap">
                  <span aria-hidden="true">@</span>
                  <input id="profile-username" type="text" value={form.username} minLength={3} maxLength={USERNAME_LIMIT} pattern="[A-Za-z0-9_.]{3,30}" autoComplete="username" required placeholder="your.handle" onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} />
                </span>
                <span className="profile-hint">3–30 characters · letters, numbers, periods and underscores. Usernames are unique.</span>
              </label>
              <label htmlFor="profile-email">Email
                <span className="profile-input-wrap is-readonly">
                  <Mail size={15} />
                  <input id="profile-email" type="email" value={profile.email || session.user.email || ''} readOnly disabled aria-describedby="profile-email-help" />
                </span>
                <span className="profile-hint" id="profile-email-help">Email is controlled by Supabase Authentication and cannot be changed here.</span>
              </label>
              <label htmlFor="profile-bio">Bio
                <textarea id="profile-bio" value={form.bio} maxLength={BIO_LIMIT} placeholder="Tell visitors a little about yourself." onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} />
                <span className="profile-hint">{form.bio.length} / {BIO_LIMIT}</span>
              </label>

              <div className="profile-upload-row">
                {avatarUrl
                  ? <img className="profile-upload-preview" src={avatarUrl} alt="Avatar preview" />
                  : <span className="profile-upload-preview profile-avatar-fallback" aria-hidden="true">{initialFor(profile, session)}</span>}
                <label className="profile-file-button" htmlFor="profile-avatar-file"><ImagePlus size={15} /> Choose image</label>
                <input ref={fileInputRef} className="profile-file-input" id="profile-avatar-file" type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={pickFile} />
                <span className="profile-hint">PNG, JPEG, WebP or AVIF · up to 3 MB</span>
              </div>

              <div className="profile-form-actions">
                <button className="button button-primary" type="submit" disabled={saving}>
                  {saving ? <LoaderCircle className="profile-spin" size={16} /> : <Check size={16} />} {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button className="button button-ghost" type="button" onClick={cancelEditing} disabled={saving}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      </div>
      <MyReviews userId={session.user.id} />
    </section>
  );
}
