# Supabase setup

1. Create a Supabase project and copy its Project URL and **publishable/anon key** into a root `.env` file:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-anon-key
   ```

   Never put a `service_role` key in a `VITE_` variable or in browser code.

2. Run [`schema.sql`](./schema.sql) in the Supabase SQL Editor. It creates the profiles/role system, auth-user trigger, CMS tables, row-level security policies, and the public `portfolio-media` image bucket. If you ran an older version of this file before, run the updated file again to add the profile-based role checks.

3. In Supabase **Authentication → Settings**, enable **Allow new users to sign up** to allow visitors to register through `/register`. The schema creates a `profiles` row with the `user` role for every new auth account. To make a trusted existing account an administrator, run this in the SQL Editor with the correct email:

   ```sql
   update public.profiles
   set role = 'admin', updated_at = now()
   where id = (select id from auth.users where email = 'you@example.com');
   ```

   The profile is readable by its owner, but users cannot update their own role. Admin-only data policies and storage policies check `profiles.role` through the `is_portfolio_admin()` database function.

4. Restart Vite after adding `.env`. Visitors sign in at `/signin` or register at `/register` — there is a **single sign-in page for everyone**. After signing in, the app reads `public.profiles` for that user; when `role = 'admin'` an **Admin dashboard** link appears in the navigation and `/admin` becomes accessible. Non-admins are redirected to the homepage, both by the hidden link and by the role check that guards the admin routes.

Published projects and articles are readable by the public portfolio; drafts and all writes remain restricted to admins. Skills are publicly readable and admin-writable. Images are limited to 5 MB and supported image MIME types.

## Contact form inbox

The public contact form inserts submissions into `public.contact_requests`, attaching the signed-in user when available and allowing guest submissions. Admins can manage requests at `/admin/contact-requests`, set new/read/replied/closed status, and reply using their email app. The dashboard shows a live new-request badge.

## Admin users and reviews

The dashboard includes live account totals and a searchable Users section. Admins can open a user's profile to see account status, creation and last-login times, and their complete review history. The Reviews section supports pending/approved/rejected filters and admin edit, moderation, and delete actions. Signed-in users can submit and manage their own reviews under Profile; new submissions start as pending.

For an existing project, first apply [`schema.sql`](./schema.sql) if the profile/role system and `is_portfolio_admin()` helper are not already installed. Then run [`admin-management.sql`](./admin-management.sql) once in the Supabase SQL Editor. This migration reuses `profiles`, creates `reviews` and `contact_requests` only if absent, adds their foreign keys, RLS policies, admin-only RPCs, and Realtime publication entries. New projects can run `schema.sql` alone; it includes the same migration.

The `admin_list_users()` RPC is the only browser path to account-wide auth information and returns data only when the caller has the admin profile role. The service-role key is never used by the app. Keep the normal signup/auth flow and promote administrators from the SQL Editor as described above. After applying the migration, reload the dashboard; Realtime updates the users, reviews, and contact requests as rows change.

## User profiles

Every account has a row in `public.profiles` (`email`, `full_name`, `username`, `avatar_url`, `bio`, `role`). The `on_auth_user_created` trigger creates it automatically at signup, and the page at `/profile` reads and updates it using the signed-in user's id (`auth.uid()`).

- Users may read and update **only their own** row. Column-level grants mean a normal user can never change `role`, `email` or `id`, so nobody can promote themselves to admin from the profile form.
- Email is owned by Supabase Authentication. The profile form shows it read-only.
- Avatars live in the public `avatars` bucket under `{auth.uid()}/…`; users can only upload/update/delete files inside their own folder.
- `role` is still changed from the Supabase dashboard/SQL (step 3 above), never from the app.

If the profile page reports that `public.profiles` is missing or out of date, re-run [`schema.sql`](./schema.sql) — it is idempotent and will add the profile columns, the trigger, the policies and the `avatars` bucket.

### Instagram-style usernames

Registration requires a unique username containing 3–30 letters, numbers, periods or underscores. The value is trimmed and lowercased before it is saved to `public.profiles.username`; profile displays add the `@` prefix. Email addresses are never used to generate usernames. Google/OAuth accounts can choose their username later in Profile Settings.

For an existing project, run [`username-migration.sql`](./username-migration.sql) in the Supabase SQL Editor. It clears usernames that exactly matched the prior email-derived default, normalizes valid handles, clears invalid or duplicate values for their owners to replace, adds the case-insensitive unique index and format constraint, and updates the availability RPC, auth trigger, and own-profile RLS/grants. The availability RPC only returns whether a requested handle is free; the unique index remains the final protection against simultaneous signups or updates. After running it, users whose handle was cleared should set a username under Profile Settings.

The main [`schema.sql`](./schema.sql) includes the same username rules for new installations. Users can read/update only their own profile row; `role`, `email`, and `id` remain protected by grants and the row policy.

### Log in with a username

The login form accepts either an email address or a username. Username login uses [`functions/login-with-username/index.ts`](./functions/login-with-username/index.ts), a Supabase Edge Function that looks up the account server-side and never returns its email address. It is a public login endpoint, so [`config.toml`](./config.toml) disables gateway JWT verification for this function; user credentials are still validated by Supabase Auth in the function. Deploy the function and its configuration after applying the username migration:

```sh
supabase functions deploy login-with-username
```

The function uses Supabase's built-in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` environment variables. Never add the service-role key to Vite environment variables or browser code.

If the login page reports that the function is not deployed, link the Supabase CLI to the correct project (`supabase link --project-ref <project-ref>`) and rerun the deploy command. Invalid username/password combinations return the same generic error to avoid revealing whether an account exists.

If Supabase reports that `public.is_username_available(candidate_username)` cannot be found in the schema cache, run the username migration in the SQL Editor for the same project URL configured in the website. The migration grants the RPC to `anon` and `authenticated` and sends a PostgREST schema reload notification. If the function was already created, the following refresh can be run by itself:

```sql
notify pgrst, 'reload schema';
```

## Vercel deployment

In the Vercel project settings, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables for the Production environment (and Preview if needed). Use the same Supabase Project URL and publishable/anon key as the local `.env` file. Redeploy after saving the variables because Vite embeds them during the build. Do not configure `NEXT_PUBLIC_*` variables; this project is built with Vite, not Next.js.

## Authentication providers

- In **Authentication → URL Configuration**, set the Site URL to your app and allow its callback URLs. For local development, allow `http://localhost:5173/auth/callback` and `http://127.0.0.1:5173/auth/callback` (plus the password reset/admin callback URLs if using those flows). For production, allow `https://kishandev.vercel.app/auth/callback` and the corresponding password reset/admin callback URLs. These are the app URLs Supabase redirects back to; they are not the Google OAuth redirect URI.
- Enable **Google** in **Authentication → Sign In / Providers** and configure it with a Google OAuth **Web application** client ID and secret. In Google Cloud Console → APIs & Services → Credentials → that OAuth client → **Authorized redirect URIs**, add the Supabase Auth callback exactly:

  ```text
  https://adzanwgsxqrxjtpkfzid.supabase.co/auth/v1/callback
  ```

  This is the URI Google checks for `redirect_uri_mismatch`. Do not add the app's `/auth/callback` URL here: that is the separate Supabase redirect allow-list entry above. Copy the callback URI shown on the Supabase Google provider page if the Supabase project URL differs. The sign-in/register pages use Google OAuth and return to `/auth/callback`. No provider secrets belong in this repository.
- The public navigation **Sign in** link opens `/signin`; new users can create accounts at `/register`. There is one sign-in page for all accounts. After sign-in the app reads the role from `public.profiles`; administrators additionally see an **Admin dashboard** link and can open `/admin`, while everyone else is redirected to the homepage.

## Troubleshooting

### "Portfolio content is temporarily unavailable" / admin sign-in fails

This almost always means the database schema has not been applied yet. Confirm it by opening these URLs in a browser (replace `<project-ref>` and `<anon-key>` with your values):

```text
https://<project-ref>.supabase.co/rest/v1/projects?select=id&limit=1&apikey=<anon-key>
https://<project-ref>.supabase.co/storage/v1/bucket?apikey=<anon-key>
```

- If the first returns `{"code":"PGRST205","message":"Could not find the table 'public.projects' in the schema cache"}`, the tables are missing.
- If the second returns `[]`, the `portfolio-media` bucket is missing.

Fix: open **Supabase → SQL Editor → New query**, paste the entire contents of [`schema.sql`](./schema.sql), and click **Run**. Then confirm in **Table Editor** that `profiles`, `projects`, `news`, and `skills` exist and that **Storage** shows the `portfolio-media` bucket. Finally, grant your account the `admin` role as described in step 3 above.

`schema.sql` is idempotent (`create table if not exists`, `drop policy if exists`), so it is safe to run again after updates.

### Google / Facebook sign-in does nothing

Social sign-in only works after the provider is enabled. Check the current state at:

```text
https://<project-ref>.supabase.co/auth/v1/settings?apikey=<anon-key>
```

If `external.google` (or `external.facebook`) is `false`, enable it in **Authentication → Sign In / Providers** and follow the OAuth setup in the "Authentication providers" section above. Email/password sign-in works even when `external.email` is the only provider set to `true`.

### Registered but cannot sign in immediately

By default Supabase requires new users to confirm their email (`mailer_autoconfirm` is `false`). New registrations cannot sign in until the confirmation link is clicked. For quick local testing, either confirm the email or disable email confirmation in **Authentication → Sign In / Providers → Email**.
