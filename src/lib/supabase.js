import { createClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseConfigured, supabaseUrl } from './supabase-env.js';
import { authStorage } from './auth-storage.js';

export { supabaseConfigured } from './supabase-env.js';
export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: authStorage },
  })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your local .env file or hosting environment, then restart or redeploy the app.');
  }
  return supabase;
}

export function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
