# MythicHQ

MythicHQ is a movie discovery website for finding something good to watch. It brings movie browsing, discovery tools, trailers, watchlists, and community features together in one place.

**Live website:** [mythichq.vercel.app](https://mythichq.vercel.app/)

## What you can do

- **Explore the home page** for featured movies, trending titles, top-rated picks, upcoming releases, hidden gems, and curated collections.
- **Browse the catalog** and discover movies by genre, language, popularity, or rating.
- **Search for a movie** and open its details page for its synopsis, cast and crew, ratings, genres, languages, streaming availability, and related titles.
- **Watch trailers** from movie cards and detail pages when a trailer is available.
- **Save movies to a watchlist** so you can come back to them later.
- **Find a random pick** when you are not sure what to watch.
- **Create an account or sign in** to access account features such as your profile, profile photos, and saved watchlist.
- **Leave and read reviews** on movie pages.

## Pages

| Page | What it is for |
| --- | --- |
| Home | Featured titles and curated movie sections |
| Movies | Browse the full movie catalog |
| Discovery | Explore and filter movies |
| Trending | See movies that are popular now |
| Top Rated | Browse highly rated titles |
| Genres and Languages | Find movies by category or spoken language |
| Upcoming | See movies scheduled for release |
| Search | Look up a movie by title |
| Movie details | Read about a movie, view related titles, and check streaming availability |
| Watchlist | Revisit movies you have saved |

## For administrators

Authorized administrators can use the admin area to manage movie listings, featured and curated sections, profile icons, reviews, users, contact messages, notifications, and site settings. Admin access is restricted to approved accounts.

## Run MythicHQ locally

You need Node.js 20.19+ or 22.12+ and npm.

```bash
npm install
npm run dev
```

Open the URL printed by Vite, usually `http://localhost:5173`. The sign-in page is available at `/login`.

## Connect external services

Create a `.env` file in the project root when you want to connect Supabase:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Supabase is used for connected account, catalog, review, and admin data. The movie catalog uses TMDB for movie information and artwork. A TMDB key can be set as `VITE_TMDB_API_KEY` or entered in the app's settings. Restart the development server after editing `.env`.

New user profiles are created by a database trigger on `auth.users`. Run [`supabase/profiles_trigger.sql`](./supabase/profiles_trigger.sql) in the Supabase Dashboard's SQL Editor to create the `profiles` table if needed, install the trigger, and backfill existing auth users. For the complete app database schema, run [`supabase/schema.sql`](./supabase/schema.sql) as well.

To create or update the app database tables, run the complete [`supabase/schema.sql`](./supabase/schema.sql) file in the Supabase Dashboard's SQL Editor. It includes the profile, movie, hero, movie section, watchlist, review, notification, and contact-message tables and their row-level security policies. It is safe to rerun and preserves existing table data. Afterward, select movies in **Admin → Hero**; until any are selected, the homepage uses trending movies as its hero slides.

To enable profile icons on an existing or new Supabase project, run [`supabase/profile_icons.sql`](./supabase/profile_icons.sql) in the SQL Editor after `schema.sql`. It creates the icon catalog and public Storage bucket, seeds the four bundled photos in `public/profile-image`, and restricts icon uploads and catalog changes to admins with database policies. Uploaded images persist in Supabase Storage. Removing an icon only removes it from the selection catalog; existing profiles keep their image.

To enable household viewing profiles, run [`supabase/viewer_profiles.sql`](./supabase/viewer_profiles.sql) in the SQL Editor after `schema.sql`. This creates `public.viewer_profiles` separately from `public.profiles`, which stores each account's MythicHQ member profile. Viewing profiles have owner-only row-level security and a database-enforced maximum of five per account. After sign-in, members choose a viewing profile before entering the movie experience; the choice is kept in the current browser session.

To enable movie detail metadata, private likes/reactions, hype and trending signals, and admin-managed curated movie sections, run [`supabase/movie_details_features.sql`](./supabase/movie_details_features.sql) in the SQL Editor after `schema.sql`. It adds optional movie metadata and curated-section fields, owner-only action tables, a daily view log, and a safe RPC that exposes only a movie's hype percentage and a non-numeric trending badge. Admin movie editing supports IMDb rating, credits, providers, movie badges, and initial hype values.

To manage structured movie cast and crew, run [`supabase/movie_cast_crew.sql`](./supabase/movie_cast_crew.sql) in the SQL Editor after `schema.sql`. This installs the cast-save RPC that deduplicates submitted actor/character pairs while preserving the database uniqueness constraint. The admin editor supports cast and crew entries, profile image uploads to the existing `POSTER` Storage bucket, editing, deletion, and display ordering; movie details display the saved cast and crew. Apply this migration before editing credits in Supabase.

To enable the centralized cast directory, run [`supabase/central_cast_management.sql`](./supabase/central_cast_management.sql) after `schema.sql`, `movie_details_features.sql`, and `movie_cast_crew.sql`. It creates `cast_members`, links movie cast entries through `cast_member_id`, backfills existing structured and comma-separated cast records, installs the ordered cast-save RPC, and grants public read access to profile images in the existing `POSTER` Storage bucket so signed image URLs can be created. The Admin **Cast** page and movie form then share these profiles; deleting a cast member also removes its movie links. Cast inserts and image uploads require a signed-in account whose `public.profiles.role` is `admin`; verify that role if Supabase reports an RLS policy error.

To enable first-login profile setup for existing Supabase projects, run [`supabase/profile_onboarding.sql`](./supabase/profile_onboarding.sql) after `schema.sql`. It marks existing accounts as already set up, enforces case-insensitive username uniqueness, and installs the username availability check. New accounts created by the updated profile trigger are marked incomplete and must choose a profile image and username before entering the site.

The admin movie form stores an optional title artwork URL in `public.movies.title_image_url`. For an existing database, run [`supabase/title_image_link.sql`](./supabase/title_image_link.sql) in the SQL Editor before saving title image links. The script adds the column and requests a PostgREST schema-cache reload. The content library always displays the database movie title as text, whether or not that image is available.

Hero management is restricted to accounts whose `public.profiles.role` is `admin`. If adding a hero movie returns an RLS policy error, run [`supabase/hero_section.sql`](./supabase/hero_section.sql) in the SQL Editor to install or repair the table policies. Then verify that the signed-in account's profile has the `admin` role:

```sql
select id, email, role
from public.profiles
where email = 'your-account-email';
```

If this is the intended administrator account and its role is not `admin`, promote only that account from the SQL Editor:

```sql
update public.profiles
set role = 'admin'
where email = 'your-account-email';
```

Genre choices in the admin movie form are stored in `public.genre_options`. Run [`supabase/genre_options.sql`](./supabase/genre_options.sql) in the SQL Editor for an existing database to install the table, seed the default and existing movie genres, and enable admin-only changes. Removing a choice hides it from the picker but does not modify genre data already saved on existing movies.

Google sign-in returns to the public production URL `https://mythichq.vercel.app` (Vite development on localhost returns to its local app). Configure the production URL under Supabase Authentication → URL Configuration as the Site URL and allow `https://mythichq.vercel.app/**`, `http://localhost:5173/**`, and `http://127.0.0.1:5173/**` under Redirect URLs. Password-reset emails return to `/reset-password`; make sure the deployed and local reset-password URLs are covered by those Redirect URL entries. In Supabase email templates, keep the confirmation link based on `{{ .ConfirmationURL }}` so Supabase honors the `emailRedirectTo` requested by the app; a template linking directly to `{{ .SiteURL }}` can send users to the configured Site URL instead. The Google OAuth client's authorized redirect URI must be the Supabase callback URL shown in Supabase Authentication → Providers → Google. Keep the production Vercel deployment publicly accessible; Vercel Deployment Protection on the production deployment will interrupt sign-in after Google authentication.

For production deployments, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the Vercel project's **Production** environment and redeploy. Use the Supabase project URL and its public anon/publishable key; never put a service-role key in a `VITE_` variable. Production builds always use `https://mythichq.vercel.app` for auth email links and OAuth return URLs, even if someone opens the built site from a localhost URL. Vite development on localhost keeps using its own origin. The root `vercel.json` rewrite serves the SPA for direct navigation to `/login`, `/reset-password`, and other client-side routes.

Do not commit private credentials. Values prefixed with `VITE_` are exposed in the browser, so use only public client keys and configure access policies in Supabase.

## Developer commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Build the production site into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run Oxlint |
