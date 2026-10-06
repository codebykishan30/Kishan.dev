import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  let payload: { username?: unknown; password?: unknown };
  try {
    payload = await request.json();
  } catch {
    return response({ error: 'Invalid request.' }, 400);
  }

  const username = typeof payload.username === 'string' ? payload.username.trim().toLowerCase() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  if (!/^[a-z0-9_.]{3,30}$/.test(username) || !password) {
    return response({ error: 'Username or password is incorrect.' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Username login is missing Supabase function environment variables.');
    return response({ error: 'Username login is temporarily unavailable.' }, 500);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  if (profileError) {
    console.error('Username login profile lookup failed:', profileError.message);
    return response({ error: 'Username login is temporarily unavailable.' }, 500);
  }

  if (!profile) return response({ error: 'Username or password is incorrect.' }, 401);

  const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(profile.id);
  const email = userData.user?.email;
  if (userError || !email) {
    if (userError) console.error('Username login account lookup failed:', userError.message);
    return response({ error: 'Username or password is incorrect.' }, 401);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({ email, password });
  if (authError || !authData.session) {
    return response({ error: 'Username or password is incorrect.' }, 401);
  }

  return response({ session: authData.session });
});
