import { requireSupabase } from './supabase.js';

export const AVATAR_BUCKET = 'avatars';
export const AVATAR_MAX_BYTES = 3 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const PROFILE_COLUMNS = 'id,email,full_name,username,avatar_url,bio,role,created_at,updated_at';
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;

const MISSING_TABLE_CODES = ['PGRST205', '42P01'];
const MISSING_COLUMN_CODES = ['PGRST204', '42703'];

function trimmed(value) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result === '' ? null : result;
}

export function normalizeUsername(value) {
  const cleaned = String(value ?? '').trim().toLowerCase();
  return cleaned === '' ? null : cleaned;
}

export function validateUsername(value) {
  const username = normalizeUsername(value);
  if (!username || !USERNAME_PATTERN.test(username)) {
    throw new Error('Username must be 3–30 characters and use only letters, numbers, periods, or underscores.');
  }
  return username;
}

export async function isUsernameAvailable(value) {
  const username = validateUsername(value);
  const { data, error } = await requireSupabase().rpc('is_username_available', {
    candidate_username: username,
  });
  if (error) throw error;
  return data === true;
}

export function isMissingProfileTableError(error) {
  if (!error) return false;
  const code = error.code || '';
  const message = error.message || '';
  return MISSING_TABLE_CODES.includes(code) || (/schema cache/i.test(message) && /profiles/i.test(message));
}

export function isMissingProfileColumnError(error) {
  if (!error) return false;
  const code = error.code || '';
  const message = error.message || '';
  return MISSING_COLUMN_CODES.includes(code) || (/schema cache/i.test(message) && /column/i.test(message));
}

// Turns a raw Supabase/PostgREST error into a message a visitor can act on.
export function describeProfileError(error) {
  if (!error) return 'Something went wrong. Please try again.';
  const code = error.code || '';
  const message = error.message || '';
  if (isMissingProfileTableError(error)) {
    return 'The public.profiles table is missing from your Supabase schema cache. Open the Supabase SQL Editor, run supabase/schema.sql, then reload this page.';
  }
  if (isMissingProfileColumnError(error)) {
    return 'Your public.profiles table is out of date — it is missing the profile columns (email, full_name, username, avatar_url, bio). Re-run supabase/schema.sql in the Supabase SQL Editor, then reload this page.';
  }
  if (/bucket not found/i.test(message)) {
    return 'The avatars storage bucket is missing. Re-run supabase/schema.sql in the Supabase SQL Editor to create it, then try again.';
  }
  if (/infinite recursion detected in policy/i.test(message)) {
    return 'Supabase rejected the request because the row-level security policy for public.profiles is recursive. Re-run supabase/schema.sql in the Supabase SQL Editor (it replaces the recursive policy), then reload this page.';
  }
  if (code === '23505' || /duplicate key/i.test(message)) {
    return 'Username is already taken.';
  }
  if (code === '23514' || /violates check constraint/i.test(message)) {
    return 'Some of the values entered are not allowed. Please review them and try again.';
  }
  if (code === '23503' || /foreign key/i.test(message)) {
    return 'That profile is not linked to a valid account. Please sign out and sign in again.';
  }
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    return 'Supabase refused the request (row-level security). Make sure you are signed in and that supabase/schema.sql has been applied so your profile row is writable.';
  }
  if (code === 'PGRST301' || /jwt/i.test(message)) {
    return 'Your session has expired. Please sign in again to continue.';
  }
  return message || 'Something went wrong. Please try again.';
}

export async function getSession() {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

export async function fetchProfile(userId) {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// Reads the profile for the signed-in user. If the trigger has not created the
// row yet (for example an account made before the schema was applied), the row
// is created here from the real Supabase Auth user — never from fake data.
export async function ensureProfile(user) {
  const existing = await fetchProfile(user.id);
  const metadata = user.user_metadata || {};
  const googleAvatar = /^https:\/\//i.test(metadata.avatar_url || metadata.picture || '')
    ? trimmed(metadata.avatar_url || metadata.picture)
    : null;
  if (existing) {
    if (existing.avatar_url || !googleAvatar) return existing;

    const { data, error } = await requireSupabase()
      .from('profiles')
      .update({ avatar_url: googleAvatar })
      .eq('id', user.id)
      .select(PROFILE_COLUMNS)
      .single();
    if (error) throw error;
    return data;
  }

  const username = normalizeUsername(metadata.username);
  const base = {
    id: user.id,
    email: user.email || null,
    full_name: trimmed(metadata.full_name) || trimmed(metadata.name),
    avatar_url: googleAvatar,
    username,
  };
  const supabase = requireSupabase();

  let { data, error } = await supabase
    .from('profiles')
    .insert(base)
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    const retry = await fetchProfile(user.id).catch(() => null);
    if (retry) return retry;
    throw error;
  }
  return data;
}

// Only the editable display columns are sent. `role`, `email` and `id` are
// never included and are also blocked by column-level grants in the database.
export async function updateProfile(userId, updates) {
  const username = validateUsername(updates.username);
  const payload = {
    full_name: trimmed(updates.full_name),
    username,
    bio: trimmed(updates.bio),
  };
  if (Object.prototype.hasOwnProperty.call(updates, 'avatar_url')) {
    payload.avatar_url = trimmed(updates.avatar_url);
  }

  const { data, error } = await requireSupabase()
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .single();
  if (error?.code === '23505' || /profiles_username_unique|duplicate key/i.test(error?.message || '')) {
    throw new Error('Username is already taken.');
  }
  if (error) throw error;
  return data;
}

export async function uploadAvatar(userId, file) {
  if (!file) return null;
  if (!AVATAR_MIME_TYPES.includes(file.type)) {
    throw new Error('Please choose a PNG, JPEG, WebP or AVIF image.');
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error('Profile pictures must be 3 MB or smaller.');
  }

  const extension = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${userId}/avatar-${Date.now()}.${extension}`;
  const storage = requireSupabase().storage.from(AVATAR_BUCKET);

  const { data, error } = await storage.upload(path, file, {
    cacheControl: '31536000',
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;

  const { data: publicUrl } = storage.getPublicUrl(data.path);
  return publicUrl.publicUrl;
}

// Resolves the account role for a Supabase auth user, creating the profile row
// from the auth user when it is missing (for example when the auth trigger was
// never installed) so a brand-new account can still sign in. Never throws for a
// missing row, and only ever returns 'admin' when profiles.role really is admin.
export async function resolveAccountRole(user) {
  const profile = await ensureProfile(user);
  return profile?.role === 'admin' ? 'admin' : 'user';
}