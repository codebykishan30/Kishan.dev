import { useEffect, useState } from 'react';
import { supabaseConfigured } from './supabase-env.js';
import { requireSupabase } from './supabase.js';
import { describeProfileError, ensureProfile } from './profile.js';

// The one place that answers "who is signed in, and are they an admin?".
// It reads the Supabase session, then resolves public.profiles for that user
// (auth.uid()), which is also what the database row-level security enforces.
export function subscribeAccount(onChange) {
  if (!supabaseConfigured) {
    onChange({ status: 'unconfigured', session: null, profile: null, role: null, error: '' });
    return () => {};
  }

  const supabase = requireSupabase();
  let active = true;
  let loadedId = null;
  const publish = (next) => { if (active) onChange(next); };
  const anonymous = () => publish({ status: 'anonymous', session: null, profile: null, role: null, error: '' });

  async function load(session) {
    if (!session?.user) {
      loadedId = null;
      anonymous();
      return;
    }
    if (loadedId === session.user.id) return;
    loadedId = session.user.id;
    try {
      const profile = await ensureProfile(session.user);
      publish({
        status: 'ready',
        session,
        profile,
        role: profile?.role === 'admin' ? 'admin' : 'user',
        error: '',
      });
    } catch (error) {
      loadedId = null;
      publish({ status: 'error', session, profile: null, role: null, error: describeProfileError(error) });
    }
  }

  supabase.auth.getSession().then(({ data, error }) => {
    if (!active) return;
    if (error) {
      publish({ status: 'error', session: null, profile: null, role: null, error: describeProfileError(error) });
      return;
    }
    load(data.session);
  }).catch((error) => {
    publish({ status: 'error', session: null, profile: null, role: null, error: describeProfileError(error) });
  });

  const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
    if (!active) return;
    if (event === 'SIGNED_OUT') {
      loadedId = null;
      anonymous();
      return;
    }
    load(nextSession);
  });

  return () => {
    active = false;
    data.subscription.unsubscribe();
  };
}

export function useAccount() {
  const [account, setAccount] = useState(() => (supabaseConfigured
    ? { status: 'loading', session: null, profile: null, role: null, error: '' }
    : { status: 'unconfigured', session: null, profile: null, role: null, error: '' }));

  useEffect(() => subscribeAccount(setAccount), []);
  return account;
}