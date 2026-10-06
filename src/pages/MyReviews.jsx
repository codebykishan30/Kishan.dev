import { useCallback, useEffect, useState } from 'react';
import { Check, CircleHelp, LoaderCircle, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { requireSupabase } from '../lib/supabase.js';

const emptyForm = { movie_id: '', movie_title: '', rating: '5', review_text: '' };

function messageFor(error) {
  return error?.message || 'Something went wrong. Please try again.';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function MyReviews({ userId }) {
  const [reviews, setReviews] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const refresh = useCallback(async () => {
    const { data, error: queryError } = await requireSupabase().from('reviews')
      .select('id,movie_id,movie_title,rating,review_text,status,created_at,updated_at')
      .eq('user_id', userId).order('created_at', { ascending: false });
    if (queryError) throw queryError;
    setReviews(data || []);
  }, [userId]);

  useEffect(() => {
    let active = true;
    const load = () => refresh().catch((loadError) => { if (active) setError(messageFor(loadError)); });
    load();
    const db = requireSupabase();
    const channel = db.channel(`my-reviews-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews', filter: `user_id=eq.${userId}` }, load)
      .subscribe();
    return () => { active = false; db.removeChannel(channel); };
  }, [refresh, userId]);

  function beginEdit(review) {
    setEditingId(review.id);
    setForm({ movie_id: review.movie_id || '', movie_title: review.movie_title, rating: String(review.rating), review_text: review.review_text });
    setError('');
    setSuccess('');
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setSuccess('');
    const payload = {
      movie_id: form.movie_id.trim() || null,
      movie_title: form.movie_title.trim(),
      rating: Number(form.rating),
      review_text: form.review_text.trim(),
    };
    try {
      const request = editingId
        ? requireSupabase().from('reviews').update(payload).eq('id', editingId).eq('user_id', userId)
        : requireSupabase().from('reviews').insert({ ...payload, user_id: userId });
      const { error: saveError } = await request;
      if (saveError) throw saveError;
      await refresh();
      setSuccess(editingId ? 'Your review was updated.' : 'Your review was submitted for moderation.');
      resetForm();
    } catch (saveError) {
      setError(messageFor(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function remove(review) {
    if (!window.confirm(`Delete your review for “${review.movie_title}”?`)) return;
    const { error: deleteError } = await requireSupabase().from('reviews').delete().eq('id', review.id).eq('user_id', userId);
    if (deleteError) { setError(messageFor(deleteError)); return; }
    setReviews((current) => (current || []).filter((item) => item.id !== review.id));
    if (editingId === review.id) resetForm();
    setSuccess('Your review was deleted.');
  }

  return <section className="glass-card profile-reviews profile-enter" aria-labelledby="my-reviews-title">
    <div className="profile-reviews-heading"><div><p className="eyebrow">YOUR ACTIVITY</p><h3 id="my-reviews-title">My reviews <span>{reviews?.length ?? '…'}</span></h3><p>Reviews are held for admin moderation before approval.</p></div><Star size={19} /></div>
    {success && <div className="profile-message success" role="status"><Check size={15} />{success}</div>}
    {error && <div className="profile-message" role="alert"><CircleHelp size={15} />{error}</div>}

    <form className="profile-review-form" onSubmit={submit}>
      <div className="profile-review-form-heading"><h4>{editingId ? 'Edit review' : 'Write a review'}</h4>{editingId && <button type="button" className="profile-review-cancel" onClick={resetForm}><X size={14} /> Cancel</button>}</div>
      <div className="profile-review-fields">
        <label>Movie title<input required maxLength={160} value={form.movie_title} onChange={(event) => setForm({ ...form, movie_title: event.target.value })} placeholder="Movie title" disabled={saving} /></label>
        <label>Movie ID <span className="profile-hint">Optional</span><input maxLength={120} value={form.movie_id} onChange={(event) => setForm({ ...form, movie_id: event.target.value })} placeholder="Catalog ID" disabled={saving} /></label>
        <label>Rating<select value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })} disabled={saving}>{[5, 4, 3, 2, 1].map((rating) => <option value={rating} key={rating}>{rating} / 5 stars</option>)}</select></label>
      </div>
      <label className="profile-review-text-label">Review<textarea required minLength={2} maxLength={5000} rows={4} value={form.review_text} onChange={(event) => setForm({ ...form, review_text: event.target.value })} placeholder="What did you think of the movie?" disabled={saving} /></label>
      <button className="button button-primary" type="submit" disabled={saving}>{saving ? <LoaderCircle className="profile-spin" size={15} /> : editingId ? <Check size={15} /> : <Plus size={15} />}{saving ? 'Saving…' : editingId ? 'Save review' : 'Submit review'}</button>
    </form>

    <div className="profile-review-list" aria-live="polite">
      {reviews === null ? <div className="profile-review-empty"><LoaderCircle className="profile-spin" size={17} /> Loading your reviews…</div>
        : reviews.length === 0 ? <div className="profile-review-empty">You haven’t submitted any reviews yet.</div>
          : reviews.map((review) => <article className="profile-review-card" key={review.id}>
            <div className="profile-review-card-heading"><div><h4>{review.movie_title}</h4>{review.movie_id && <small>Movie ID {review.movie_id}</small>}</div><span className={`profile-review-status ${review.status}`}>{review.status}</span></div>
            <div className="profile-review-meta"><span><Star size={13} fill="currentColor" /> {review.rating} / 5</span><time>{formatDate(review.created_at)}</time></div>
            <p>{review.review_text}</p>
            <div className="profile-review-actions"><button type="button" onClick={() => beginEdit(review)}><Pencil size={13} /> Edit</button><button type="button" onClick={() => remove(review)}><Trash2 size={13} /> Delete</button></div>
          </article>)}
    </div>
  </section>;
}
