import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Check, CheckCheck, CircleHelp, Clock3, Inbox,
  LoaderCircle, Pencil, Search, Star, Trash2, UsersRound, X,
} from 'lucide-react';
import { requireSupabase } from '../lib/supabase.js';

const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

function errorMessage(error) {
  return error?.message || 'Something went wrong. Please try again.';
}

function dateTime(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function dateOnly(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function PageHeader({ eyebrow, title, subtitle, action }) {
  return <div className="adm-page-header"><div><span className="adm-overline">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function ErrorPanel({ error, onRetry }) {
  return <div className="adm-management-error" role="alert"><CircleHelp size={17} /><div><b>Unable to load this section</b><p>{error}</p><small>Apply <code>supabase/admin-management.sql</code> in the Supabase SQL Editor, then retry.</small></div>{onRetry && <button type="button" className="adm-button adm-button-secondary" onClick={onRetry}>Retry</button>}</div>;
}

function LoadingRows() {
  return <div className="adm-management-loading" aria-live="polite"><LoaderCircle className="spin" size={19} /> Loading records…</div>;
}

function UserAvatar({ user }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user.id, user.avatar_url]);
  if (user.avatar_url && !failed) {
    return <img className="adm-user-avatar" src={user.avatar_url} alt="" onError={() => setFailed(true)} />;
  }
  const initial = (user.full_name || user.username || user.email || '?').trim().charAt(0).toUpperCase();
  return <span className="adm-user-avatar adm-user-avatar-fallback" aria-hidden="true">{initial}</span>;
}

function StatusBadge({ status }) {
  return <span className={`adm-status ${status || 'unknown'}`}>{status || 'unknown'}</span>;
}

export function ManagementMetrics() {
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const db = requireSupabase();
    const [users, reviews, pendingReviews, newRequests] = await Promise.all([
      db.from('profiles').select('id', { count: 'exact', head: true }),
      db.from('reviews').select('id', { count: 'exact', head: true }),
      db.from('reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('contact_requests').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    ]);
    const failure = users.error || reviews.error || pendingReviews.error || newRequests.error;
    if (failure) throw failure;
    setCounts({ users: users.count || 0, reviews: reviews.count || 0, pending: pendingReviews.count || 0, requests: newRequests.count || 0 });
    setError('');
  }, []);

  useEffect(() => {
    let active = true;
    const load = () => refresh().catch((error) => { if (active) setError(errorMessage(error)); });
    load();
    const db = requireSupabase();
    const channel = db.channel('admin-management-metrics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_requests' }, load)
      .subscribe();
    return () => { active = false; db.removeChannel(channel); };
  }, [refresh]);

  if (error) return <ErrorPanel error={error} onRetry={() => refresh().catch((failure) => setError(errorMessage(failure)))} />;
  if (!counts) return <div className="adm-management-loading"><LoaderCircle className="spin" size={19} /> Loading account activity…</div>;

  const metrics = [
    { label: 'Total users', value: counts.users, icon: UsersRound, tint: 'violet' },
    { label: 'Total reviews', value: counts.reviews, icon: Star, tint: 'blue' },
    { label: 'New reviews', value: counts.pending, icon: Clock3, tint: 'amber' },
    { label: 'New contact requests', value: counts.requests, icon: Inbox, tint: 'green' },
  ];
  return <section className="adm-stat-grid adm-management-stat-grid" aria-label="User and feedback totals">
    {metrics.map(({ label, value, icon: Icon, tint }) => <article className="adm-stat-card" key={label}>
      <div className="adm-stat-top"><span>{label}</span><span className={`adm-stat-icon ${tint}`}><Icon size={17} /></span></div>
      <strong>{value.toLocaleString()}</strong><div className="adm-stat-foot"><span className="adm-stat-foot-dot" />Live Supabase count</div>
    </article>)}
  </section>;
}

export function UsersPage() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    const { data, error: requestError } = await requireSupabase().rpc('admin_list_users');
    if (requestError) throw requestError;
    setUsers(data || []);
    setError('');
  }, []);

  useEffect(() => {
    let active = true;
    const load = () => refresh().catch((failure) => { if (active) setError(errorMessage(failure)); });
    load();
    const db = requireSupabase();
    const channel = db.channel('admin-users-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
      .subscribe();
    return () => { active = false; db.removeChannel(channel); };
  }, [refresh]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users || [];
    return (users || []).filter((user) => `${user.username || ''} ${user.full_name || ''} ${user.email || ''} ${user.role || ''}`.toLowerCase().includes(term));
  }, [users, query]);

  return <>
    <PageHeader eyebrow="PEOPLE · ACCOUNTS" title="Users" subtitle="Browse registered accounts and review their profile activity." />
    <div className="adm-list-toolbar"><label className="adm-search"><Search size={17} /><input type="search" aria-label="Search users" placeholder="Search name, username, or email…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><span className="adm-management-total">{users ? `${filtered.length} of ${users.length} users` : 'Loading users'}</span></div>
    {error ? <ErrorPanel error={error} onRetry={() => refresh().catch((failure) => setError(errorMessage(failure)))} /> : users === null ? <LoadingRows /> : filtered.length === 0 ? <div className="adm-panel"><div className="adm-empty"><span><UsersRound size={24} /></span><h3>{query ? 'No users match your search' : 'No registered users'}</h3><p>{query ? 'Try a different name, username, or email.' : 'New signups will appear here automatically.'}</p></div></div> : <section className="adm-panel adm-table-panel">
      <div className="adm-table-wrap"><table className="adm-table adm-management-table"><thead><tr><th>USER</th><th>EMAIL</th><th>ROLE</th><th>STATUS</th><th>JOINED</th><th>LAST ACTIVITY</th><th /></tr></thead><tbody>
        {filtered.map((user) => <tr key={user.id}>
          <td><Link to={`/admin/users/${user.id}`} className="adm-user-cell"><UserAvatar user={user} /><span><b>{user.full_name || 'Name not provided'}</b><small>{user.username ? `@${user.username}` : 'Username not set'}</small></span></Link></td>
          <td>{user.email || '—'}</td><td><span className={`adm-role-pill ${user.role}`}>{user.role}</span></td><td><StatusBadge status={user.status} /></td>
          <td>{dateOnly(user.created_at)}</td><td>{dateTime(user.last_sign_in_at)}</td><td><Link className="adm-text-link" to={`/admin/users/${user.id}`}>Open profile</Link></td>
        </tr>)}
      </tbody></table></div>
    </section>}
  </>;
}

async function loadAdminReviews({ status = 'all', userId = null } = {}) {
  let request = requireSupabase().from('reviews')
    .select('id,user_id,movie_id,movie_title,rating,review_text,status,created_at,updated_at,profiles!reviews_user_id_fkey(username,email,full_name)')
    .order('created_at', { ascending: false });
  if (status !== 'all') request = request.eq('status', status);
  if (userId) request = request.eq('user_id', userId);
  const { data, error } = await request;
  if (error) throw error;
  return data || [];
}

function ReviewEditDialog({ review, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    movie_id: review.movie_id || '', movie_title: review.movie_title || '',
    rating: String(review.rating || 5), review_text: review.review_text || '', status: review.status || 'pending',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(review, { ...form, rating: Number(form.rating) });
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  return <div className="adm-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="adm-panel adm-review-modal" role="dialog" aria-modal="true" aria-labelledby="adm-review-edit-title">
      <div className="adm-panel-heading"><div><span className="adm-overline">MODERATE SUBMISSION</span><h2 id="adm-review-edit-title">Edit review</h2></div><button className="adm-icon-button" type="button" onClick={onClose} aria-label="Close review editor"><X size={17} /></button></div>
      {error && <div className="adm-management-error" role="alert"><CircleHelp size={16} /><p>{error}</p></div>}
      <form className="adm-review-form" onSubmit={submit}>
        <label className="adm-field">Movie title<input required maxLength={160} value={form.movie_title} onChange={(event) => setForm({ ...form, movie_title: event.target.value })} /></label>
        <label className="adm-field">Movie ID <span className="adm-field-help">Optional external catalog ID</span><input value={form.movie_id} onChange={(event) => setForm({ ...form, movie_id: event.target.value })} /></label>
        <label className="adm-field">Rating<select value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })}>{[1, 2, 3, 4, 5].map((rating) => <option value={rating} key={rating}>{rating} / 5 stars</option>)}</select></label>
        <label className="adm-field">Review<textarea required maxLength={5000} rows={5} value={form.review_text} onChange={(event) => setForm({ ...form, review_text: event.target.value })} /></label>
        <label className="adm-field">Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{REVIEW_STATUSES.map((status) => <option value={status} key={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
        <div className="adm-review-form-actions"><button className="adm-button adm-button-primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Save review</button><button className="adm-button adm-button-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button></div>
      </form>
    </section>
  </div>;
}

function ReviewActions({ review, onEdit, onStatus, onDelete }) {
  return <div className="adm-review-actions">
    {review.status !== 'approved' && <button type="button" className="adm-icon-button adm-review-approve" title="Approve review" aria-label="Approve review" onClick={() => onStatus(review, 'approved')}><CheckCheck size={15} /></button>}
    {review.status !== 'rejected' && <button type="button" className="adm-icon-button adm-review-reject" title="Reject review" aria-label="Reject review" onClick={() => onStatus(review, 'rejected')}><X size={15} /></button>}
    <button type="button" className="adm-icon-button" title="Edit review" aria-label="Edit review" onClick={() => onEdit(review)}><Pencil size={14} /></button>
    <button type="button" className="adm-icon-button danger" title="Delete review" aria-label="Delete review" onClick={() => onDelete(review)}><Trash2 size={14} /></button>
  </div>;
}

function ReviewTable({ reviews, showUser, onEdit, onStatus, onDelete, emptyLabel = 'No reviews yet.' }) {
  if (!reviews.length) return <div className="adm-empty adm-management-empty"><span><Star size={22} /></span><h3>{emptyLabel}</h3><p>Submitted reviews will appear here.</p></div>;
  return <div className="adm-table-wrap"><table className="adm-table adm-management-table adm-review-table"><thead><tr>{showUser && <th>USER</th>}<th>MOVIE</th><th>RATING</th><th>REVIEW</th><th>DATE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>
    {reviews.map((review) => {
      const user = Array.isArray(review.profiles) ? review.profiles[0] : review.profiles;
      return <tr key={review.id}>
        {showUser && <td><span className="adm-review-user"><b>{user?.username ? `@${user.username}` : user?.full_name || 'User'}</b><small>{user?.email || 'Email unavailable'}</small></span></td>}
        <td><span className="adm-review-movie"><b>{review.movie_title}</b>{review.movie_id && <small>ID {review.movie_id}</small>}</span></td>
        <td><span className="adm-review-rating" aria-label={`${review.rating} out of 5 stars`}><Star size={13} fill="currentColor" />{review.rating}/5</span></td>
        <td><p className="adm-review-text">{review.review_text}</p></td><td>{dateTime(review.created_at)}</td><td><StatusBadge status={review.status} /></td>
        <td><ReviewActions review={review} onEdit={onEdit} onStatus={onStatus} onDelete={onDelete} /></td>
      </tr>;
    })}
  </tbody></table></div>;
}

function useReviewActions(notify, refresh) {
  const [editing, setEditing] = useState(null);

  const save = useCallback(async (review, form) => {
    const { error } = await requireSupabase().rpc('admin_update_review', {
      p_review_id: review.id,
      p_movie_id: form.movie_id || null,
      p_movie_title: form.movie_title,
      p_rating: form.rating,
      p_review_text: form.review_text,
      p_status: form.status,
    });
    if (error) throw error;
    notify('Review updated successfully');
    await refresh();
  }, [notify, refresh]);

  const setStatus = useCallback(async (review, status) => {
    try {
      await save(review, { ...review, rating: Number(review.rating), status });
    } catch (failure) {
      notify(`Unable to update review: ${errorMessage(failure)}`, 'error');
    }
  }, [notify, save]);

  const remove = useCallback(async (review) => {
    if (!window.confirm(`Delete the review for “${review.movie_title}”? This cannot be undone.`)) return;
    const { error } = await requireSupabase().from('reviews').delete().eq('id', review.id);
    if (error) { notify(`Unable to delete review: ${errorMessage(error)}`, 'error'); return; }
    notify('Review deleted');
    await refresh();
  }, [notify, refresh]);

  return { editing, setEditing, save, setStatus, remove };
}

export function ReviewsPage({ notify }) {
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    const rows = await loadAdminReviews({ status });
    setReviews(rows);
    setError('');
  }, [status]);

  useEffect(() => {
    let active = true;
    const load = () => refresh().catch((failure) => { if (active) setError(errorMessage(failure)); });
    load();
    const db = requireSupabase();
    const channel = db.channel('admin-reviews-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, load)
      .subscribe();
    return () => { active = false; db.removeChannel(channel); };
  }, [refresh]);

  const actions = useReviewActions(notify, refresh);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return reviews || [];
    return (reviews || []).filter((review) => {
      const user = Array.isArray(review.profiles) ? review.profiles[0] : review.profiles;
      return `${review.movie_title} ${review.review_text} ${user?.username || ''} ${user?.email || ''}`.toLowerCase().includes(term);
    });
  }, [reviews, query]);

  return <>
    <PageHeader eyebrow="COMMUNITY · MODERATION" title="Reviews" subtitle="Review submissions from every registered user and moderate publication status." />
    <div className="adm-management-toolbar"><label className="adm-search"><Search size={17} /><input type="search" aria-label="Search reviews" placeholder="Search movie, user, or review…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="adm-filter-tabs" role="group" aria-label="Filter reviews by status">{['all', ...REVIEW_STATUSES].map((value) => <button type="button" key={value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div></div>
    {error ? <ErrorPanel error={error} onRetry={() => refresh().catch((failure) => setError(errorMessage(failure)))} /> : reviews === null ? <LoadingRows /> : <section className="adm-panel adm-table-panel"><ReviewTable reviews={filtered} showUser onEdit={actions.setEditing} onStatus={actions.setStatus} onDelete={actions.remove} emptyLabel="No reviews in this filter." /></section>}
    {actions.editing && <ReviewEditDialog review={actions.editing} onClose={() => actions.setEditing(null)} onSave={actions.save} />}
  </>;
}

export function UserDetailPage({ notify }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const db = requireSupabase();
    const [userResult, reviewRows] = await Promise.all([
      db.rpc('admin_list_users'),
      loadAdminReviews({ userId: id }),
    ]);
    if (userResult.error) throw userResult.error;
    setUser((userResult.data || []).find((entry) => entry.id === id) || null);
    setReviews(reviewRows);
    setError('');
  }, [id]);

  useEffect(() => {
    let active = true;
    const load = () => refresh().catch((failure) => { if (active) setError(errorMessage(failure)); });
    load();
    const db = requireSupabase();
    const channel = db.channel(`admin-user-reviews-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews', filter: `user_id=eq.${id}` }, load)
      .subscribe();
    return () => { active = false; db.removeChannel(channel); };
  }, [id, refresh]);

  const actions = useReviewActions(notify, refresh);

  return <>
    <PageHeader eyebrow="PEOPLE · USER PROFILE" title={user?.full_name || user?.username || 'User profile'} subtitle="Account details and all reviews submitted by this user." action={<button type="button" className="adm-button adm-button-secondary" onClick={() => navigate('/admin/users')}><ArrowLeft size={15} /> All users</button>} />
    {error ? <ErrorPanel error={error} onRetry={() => refresh().catch((failure) => setError(errorMessage(failure)))} /> : !user || !reviews ? <LoadingRows /> : <>
      <div className="adm-user-detail-grid">
        <section className="adm-panel adm-user-detail-card"><div className="adm-user-detail-identity"><UserAvatar user={user} /><div><span className="adm-overline">{user.role === 'admin' ? 'ADMINISTRATOR' : 'REGISTERED USER'}</span><h2>{user.full_name || 'Name not provided'}</h2><p>{user.username ? `@${user.username}` : 'Username not set'}</p></div></div><StatusBadge status={user.status} /></section>
        <section className="adm-panel adm-user-information"><span className="adm-overline">PROFILE INFORMATION</span><dl>
          <div><dt>Email</dt><dd><a href={`mailto:${user.email}`}>{user.email || '—'}</a></dd></div><div><dt>Role</dt><dd><span className={`adm-role-pill ${user.role}`}>{user.role}</span></dd></div>
          <div><dt>Account created</dt><dd>{dateTime(user.created_at)}</dd></div><div><dt>Last activity / login</dt><dd>{dateTime(user.last_sign_in_at)}</dd></div>
          <div><dt>Profile updated</dt><dd>{dateTime(user.updated_at)}</dd></div><div className="adm-user-bio-row"><dt>Bio</dt><dd>{user.bio || 'No bio provided.'}</dd></div>
        </dl></section>
      </div>
      <section className="adm-panel adm-user-reviews-panel"><div className="adm-panel-heading"><div><span className="adm-overline">USER ACTIVITY</span><h2>Reviews <span className="adm-count-badge">{reviews.length}</span></h2></div><Star size={18} /></div><ReviewTable reviews={reviews} showUser={false} onEdit={actions.setEditing} onStatus={actions.setStatus} onDelete={actions.remove} emptyLabel="This user has not submitted any reviews." /></section>
    </>}
    {actions.editing && <ReviewEditDialog review={actions.editing} onClose={() => actions.setEditing(null)} onSave={actions.save} />}
  </>;
}
