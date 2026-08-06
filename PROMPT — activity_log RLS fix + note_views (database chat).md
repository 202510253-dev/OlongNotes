# Prompt for the Database chat — activity_log policy fix + new note_views table

**Date:** 2026-08-06
**From:** Local Claude (read-only analyzer, on behalf of the user)
**For:** Database / Main Claude chat (code-modifier for the database)
**Repo:** `C:\Users\Opriasa\Desktop\OlongNotes_off\olongnotes\` (Express + Supabase)
**HEAD at handoff:** `cc9bc0b` (main, working tree clean, 6 commits ahead of origin/main)

---

## 0. TL;DR — what to ship

1. **Replace the two `activity_log` RLS policies** so the USING / WITH CHECK expressions resolve `public.users.id` via `auth_id = auth.uid()` instead of comparing `auth.uid()` (an `auth.users` UUID) directly against `activity_log.user_id` (a `public.users` bigint). The types never match for a backend PostgREST request, so the existing policies block every legitimate read/write the backend tries — that's why `routes/activities.js` is currently using `supabaseAdmin` (service role) as a workaround.
2. **Create a new `public.note_views` table** for per-user view tracking. Design: **upsert-most-recent** (one row per `(user_id, note_id)`, `viewed_at` updates on every view). Backend will upsert on every successful note view.

After both migrations land, the `routes/activities.js` `supabaseAdmin` workaround can be removed and the backend's recent-activities feed will be queryable through the anon Supabase client.

---

## 1. The pre-flight — run these 3 queries FIRST and paste the result in your reply

The user's standing rule (see `olongnotes-verify-before-flagging` memory) is "verify-before-flagging" — do not propose SQL based on old docs. The 2026-08-02 verification (databaseUpdate.txt Section 3.6) confirmed the policy **names** + **commands** but did NOT capture the policy **bodies**. We need the bodies before we can write the right replacement.

```sql
-- 1. RLS posture + full USING / WITH CHECK for every activity_log policy
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'activity_log'
ORDER BY policyname, cmd;

-- 2. activity_log + users + note_views column inventory
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('activity_log', 'note_views', 'users')
ORDER BY table_name, ordinal_position;

-- 3. Existing grants on activity_log (the third "RLS != privilege" pattern has
--    bitten this project twice already — check it explicitly)
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'activity_log'
ORDER BY grantee, privilege_type;
```

**Do NOT proceed with the migration until you have run these and posted the results in your reply.** The replacement SQL below is written against the assumption that the existing policies compare `user_id` to `auth.uid()` directly — if the actual expression is something else (e.g. the policies already do the `auth_id` join), paste what you see and I'll rewrite the prompt.

---

## 2. Migration A — replace the activity_log RLS policies

The current policies (per the verification above — confirm before running) compare `user_id` to `auth.uid()` directly, but `user_id` is a `public.users` bigint and `auth.uid()` returns an `auth.users` UUID. The two never match. Replace both with the public.users bridge:

```sql
-- Drop the existing policies (recreate fresh — the names match what's live)
DROP POLICY IF EXISTS activity_log_select ON public.activity_log;
DROP POLICY IF EXISTS activity_log_insert ON public.activity_log;

-- SELECT: a user can only read their own activity rows
CREATE POLICY activity_log_select ON public.activity_log
  FOR SELECT TO authenticated
  USING (
    user_id = (
      SELECT id FROM public.users
      WHERE auth_id = auth.uid()
    )
  );

-- INSERT: a user can only insert activity rows tagged with their own user_id
CREATE POLICY activity_log_insert ON public.activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (
      SELECT id FROM public.users
      WHERE auth_id = auth.uid()
    )
  );

-- (No UPDATE / DELETE policies — activity_log is append-only by design.
--  If you find a row needing delete, it's a data issue, not a policy one.)
```

**auth_id cast note:** `users.auth_id` is `uuid` (verified 2026-08-02 in databaseUpdate.txt Section 2.1), and `auth.uid()` already returns `uuid`, so the equality should be type-clean. If Postgres complains about the implicit cast in your Supabase version, wrap with `auth.uid()::text::uuid` — but the cleaner form above is the right first attempt.

---

## 3. Migration B — create the note_views table (upsert-most-recent design)

This is for the "Viewed" tab on the recent-activities page. The current code does NOT have a per-user view-history table — `notes.view_count` is a denormalized aggregate counter (incremented via `increment_view_count` RPC) and tracks total views, not per-user history. Without `note_views`, the Viewed tab has nothing to query.

**Design: upsert-most-recent** (user-confirmed via this prompt). One row per `(user_id, note_id)`. Every view upserts, updating `viewed_at` to NOW(). The feed query is a simple `ORDER BY viewed_at DESC` — clean, no spam, matches the "recently viewed" UX.

```sql
-- New table: per-user view history
CREATE TABLE public.note_views (
  user_id   bigint       NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  note_id   bigint       NOT NULL REFERENCES public.notes(id)   ON DELETE CASCADE,
  viewed_at timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, note_id)
);

-- Indexes for the two query patterns the feed will use:
--   "what has THIS user viewed, most recent first"     → (user_id, viewed_at DESC)
--   "who has viewed THIS note"                          → (note_id)
CREATE INDEX note_views_user_idx
  ON public.note_views (user_id, viewed_at DESC);
CREATE INDEX note_views_note_idx
  ON public.note_views (note_id);

-- RLS: same ownership pattern as likes / bookmarks / activity_log
ALTER TABLE public.note_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY note_views_select_own ON public.note_views
  FOR SELECT TO authenticated
  USING (
    user_id = (
      SELECT id FROM public.users
      WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY note_views_insert_own ON public.note_views
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (
      SELECT id FROM public.users
      WHERE auth_id = auth.uid()
    )
  );

-- (No UPDATE / DELETE policies. Updates happen via UPSERT (Postgres ON CONFLICT
--  in the backend route), which is governed by the INSERT policy under
--  WITH CHECK. Deletes aren't a feature — if a user wants to clear their
--  history, that's a future "clear activity" button, not a today thing.)

-- GRANT: third time we've hit "RLS exists but table-level GRANT missing".
-- Don't skip this — the anon-key Supabase client will 42501 without it.
GRANT SELECT, INSERT ON public.note_views TO authenticated;
```

**What the backend will do after this lands** (you do NOT need to do this — that's the local-Claude cleanup pass): in `routes/notes.js GET /:id`, after the view-count RPC, do a `supabase.from('note_views').upsert({ user_id, note_id, viewed_at: now() }, { onConflict: 'user_id,note_id' })`. Then in `routes/activities.js`, extend the GET handler to also union `note_views` rows (filtered to `user_id = req.user.id`) for the `note_viewed` filter and the "all activity" combined feed. Currently the GET is filtered to `activity_log` rows only — once `note_views` exists, the Viewed feed source moves there.

---

## 4. Post-migration verification — run after both migrations and paste results

```sql
-- 1. activity_log policies now use the public.users bridge
SELECT policyname, cmd, qual LIKE '%auth.uid()%' AS still_compares_uuid_directly
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'activity_log'
ORDER BY policyname, cmd;
-- EXPECT: 2 rows (activity_log_insert + activity_log_select), still_compares_uuid_directly = false

-- 2. note_views table exists with the right shape
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'note_views'
ORDER BY ordinal_position;
-- EXPECT: user_id (bigint NOT NULL), note_id (bigint NOT NULL), viewed_at (timestamptz NOT NULL)

-- 3. Both tables have the right RLS + GRANT
SELECT 'activity_log' AS table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'activity_log'
UNION ALL
SELECT 'note_views' AS table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'note_views'
ORDER BY table_name, grantee, privilege_type;
-- EXPECT: both tables have INSERT + SELECT to 'authenticated'

-- 4. The "RLS == verified" anti-pattern check — make sure policies exist
--    on the new table too (RLS enabled but no policies = invisible to everyone)
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'note_views'
ORDER BY policyname, cmd;
-- EXPECT: 2 rows (note_views_select_own + note_views_insert_own)
```

---

## 5. Things you might disagree with — please flag, do not silently change

1. **Upsert vs. log-every-view on `note_views`** — the user picked upsert because log-every-view would fill the table with repeat rows from the same user re-opening the same note while studying. If you have a different recommendation (e.g. dedupe within a 5-minute window instead of forever), flag it in your reply — the prompt can be revised.

2. **No UPDATE / DELETE policies on `note_views`** — view records are immutable in this design. If you want to allow users to clear their own history later (a "Clear viewed history" button), we'd need a DELETE policy. Out of scope for this prompt.

3. **No trigger from `note_views` to `activity_log`** — the `note_viewed` event will exist in BOTH tables (one row in `activity_log` for the unified feed, one row in `note_views` for the "Viewed" tab). If you'd rather have a trigger write to `activity_log` automatically on `note_views` INSERT, flag it; otherwise the backend will write both explicitly.

4. **No composite index for the "all activity" combined query** — that's a Section 9.C carry-forward from the 2026-08-02 doc. Deferrable until the table grows.

---

## 6. Related context (do not re-derive — these are the verified live-state files)

- `C:\Users\Opriasa\Desktop\ollama Analysis\databaseUpdate.txt` — full DB status, last refreshed 2026-08-06. Section 2.6 (`activity_log` schema), Section 3.6 (`activity_log` RLS — names + commands verified, BODIES need re-verification per §1 above), Section 9.B (status of this work — currently "DO NOT RUN, already in place" because the policies exist by name, but the bodies are wrong).
- `C:\Users\Opriasa\Desktop\OlongNotes_off\olongnotes\routes\activities.js` — the current code, with `supabaseAdmin` workaround flagged at lines 28-37 + 51-56 + 134-140 + 256-259.
- `C:\Users\Opriasa\Desktop\OlongNotes_off\olongnotes\routes\notes.js` — the 5 `writeActivity()` call sites: 93 (like/bookmark), 233 (upload), 402 (view), 511 (delete), 557 (report). All pass `req.user.id` (a `public.users.id` bigint per `middleware/auth.js:48`).
- `C:\Users\Opriasa\.claude\projects\C--Users-Opriasa\memory\olongnotes-verify-before-flagging.md` — the verify-before-flagging rule. The 3-query pre-flight is not optional; paste the result in your reply.

---

## 7. After you ship, ping local Claude (this chat) for the cleanup pass

The backend cleanup that drops the `supabaseAdmin` workaround is owned by local Claude (the read-only analyzer on this side, with the user's one-time code-edit permission). The 4 cleanup edits are:

1. `routes/activities.js` GET handler — switch the activity_log read from `supabaseAdmin` to `supabase`, add a parallel read from `note_views` for the Viewed source, union them in JS by `created_at` / `viewed_at` timestamp.
2. `routes/activities.js` POST handler — switch from `supabaseAdmin` to `supabase` in the `writeActivity` helper.
3. `routes/notes.js` GET /:id — after the view-count RPC, add an upsert to `note_views` via `supabase.from('note_views').upsert(...)`.
4. `routes/activities.js` header — remove the `TEMPORARY` block (lines 28-37).

Do NOT make these edits yourself — they're out of scope for this prompt. Ship the DB work, paste the §4 verification results, and local Claude will do the backend follow-up in the same commit (or a follow-up commit) so the two changes land together.

---

**Why this prompt exists:** The database chat's previous message (the user's quoted excerpt) proposed a `note_views` table + replacement policies but framed the policy problem wrong — it suggested recreating policies that are "currently missing," when in fact the policies EXIST by name and the problem is the policy BODY. Running the §1 pre-flight first will prove the diagnosis and make the §2 SQL safe. The user's standing verify-before-flagging rule caught this exact category of error three times in earlier sessions.
