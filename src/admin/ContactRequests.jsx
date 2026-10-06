import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, CircleHelp, MessageSquareText, RefreshCw, Trash2 } from 'lucide-react';
import { requireSupabase } from '../lib/supabase.js';

function errorMessage(error) {
  return error?.message || 'Something went wrong. Please try again.';
}

export default function ContactRequests({ notify }) {
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [retryCount, setRetryCount] = useState(0);

  const refresh = useCallback(async () => {
    setError('');
    const { data, error: queryError } = await requireSupabase()
      .from('contact_requests')
      .select('id,name,email,subject,message,status,created_at')
      .order('created_at', { ascending: false });
    if (queryError) throw queryError;
    setRequests(data || []);
  }, []);

  useEffect(() => {
    let active = true;
    const load = () => refresh().catch((loadError) => {
      if (active) setError(errorMessage(loadError));
    });
    load();
    const db = requireSupabase();
    const channel = db.channel('admin-contact-requests-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_requests' }, load)
      .subscribe();
    return () => { active = false; db.removeChannel(channel); };
  }, [refresh, retryCount]);

  const visibleRequests = (requests || []).filter((request) => filter === 'all' || request.status === filter);

  async function updateStatus(request, status) {
    try {
      const { error: updateError } = await requireSupabase()
        .from('contact_requests')
        .update({ status })
        .eq('id', request.id);
      if (updateError) throw updateError;
      setRequests((current) => current.map((item) => item.id === request.id ? { ...item, status } : item));
      notify('Contact request status updated.');
    } catch (updateError) {
      notify(`Unable to update request: ${errorMessage(updateError)}`, 'error');
    }
  }

  async function removeRequest(request) {
    if (!window.confirm(`Delete the contact request from ${request.name}? This cannot be undone.`)) return;
    try {
      const { error: deleteError } = await requireSupabase()
        .from('contact_requests')
        .delete()
        .eq('id', request.id);
      if (deleteError) throw deleteError;
      setRequests((current) => current.filter((item) => item.id !== request.id));
      notify('Contact request deleted.');
    } catch (deleteError) {
      notify(`Unable to delete request: ${errorMessage(deleteError)}`, 'error');
    }
  }

  return <>
    <div className="adm-page-header">
      <div><div className="adm-overline">INBOX · WEBSITE MESSAGES</div><h1>Contact requests</h1><p>Messages sent through the public portfolio contact form.</p></div>
      <button type="button" className="adm-button adm-button-secondary" onClick={() => setRetryCount((count) => count + 1)}><RefreshCw size={14} /> Refresh</button>
    </div>
    <div className="adm-list-toolbar">
      <span>{requests ? `${visibleRequests.length} request${visibleRequests.length === 1 ? '' : 's'}` : 'Loading requests…'}</span>
      <div className="adm-filter-group">
        <select aria-label="Filter contact requests by status" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="read">Read</option>
          <option value="replied">Replied</option>
          <option value="closed">Closed</option>
        </select>
      </div>
    </div>
    {error
      ? <div className="adm-empty"><span><CircleHelp size={24} /></span><h3>Couldn’t load contact requests</h3><p>{error}</p><button type="button" className="adm-button adm-button-secondary" onClick={() => setRetryCount((count) => count + 1)}>Try again</button></div>
      : !requests
        ? <div className="adm-skeleton-stack" aria-label="Loading contact requests"><span className="adm-skeleton adm-skeleton-title" /><span className="adm-skeleton" /><span className="adm-skeleton" /><span className="adm-skeleton" /></div>
        : visibleRequests.length === 0
          ? <div className="adm-empty"><span><MessageSquareText size={24} /></span><h3>{filter === 'all' ? 'No messages yet' : `No ${filter} requests`}</h3><p>{filter === 'all' ? 'Messages sent through the contact form will appear here.' : 'Try a different status filter.'}</p></div>
          : <div className="adm-contact-request-list">{visibleRequests.map((request) => (
            <article className="adm-panel adm-contact-request" key={request.id}>
              <div className="adm-contact-request-heading">
                <div><span className="adm-overline">{request.subject || 'CONTACT REQUEST'}</span><h2>{request.name}</h2><a href={`mailto:${encodeURIComponent(request.email)}`}>{request.email}</a></div>
                <div className="adm-contact-request-meta"><time>{new Date(request.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time><span className={`adm-status ${request.status}`}>{request.status}</span></div>
              </div>
              <p className="adm-contact-request-message">{request.message}</p>
              <div className="adm-contact-request-actions">
                <label>Status
                  <select value={request.status} aria-label={`Status for request from ${request.name}`} onChange={(event) => updateStatus(request, event.target.value)}>
                    <option value="new">New</option>
                    <option value="read">Read</option>
                    <option value="replied">Replied</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
                <a className="adm-button adm-button-secondary" href={`mailto:${request.email}?subject=${encodeURIComponent(`Re: ${request.subject || 'Portfolio contact request'}`)}`}>Reply by email <ArrowUpRight size={14} /></a>
                <button className="adm-icon-button adm-contact-delete" type="button" aria-label={`Delete request from ${request.name}`} onClick={() => removeRequest(request)}><Trash2 size={15} /></button>
              </div>
            </article>
          ))}</div>}
  </>;
}
