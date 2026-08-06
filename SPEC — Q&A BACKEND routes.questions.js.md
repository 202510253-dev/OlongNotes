# SPEC — Q&A backend: `routes/questions.js`

**Date:** 2026-08-06
**From:** Local Claude (read-only analyzer, on behalf of the user)
**For:** Backend Claude (code-modifier for the backend)
**Repo:** `C:\Users\Opriasa\Desktop\OlongNotes_off\olongnotes\` (Express + Supabase)
**HEAD at handoff:** `cc9bc0b` (main, in sync with origin/main, working tree clean)
**Companion spec:** `SPEC — Q&A FRONTEND browse-community.js.md` — must be implemented in parallel after this one ships

---

## 0. Status — what's already verified

✅ **Database schema** — fully verified live. `questions`, `answers`, `question_tags`, `question_likes`, `answer_likes` all exist with the columns this spec assumes. `accept_answer` RPC is callable. `answers.status` was dropped; `is_accepted` is the only acceptance flag. Three triggers maintain `likes_count` / `answers_count` automatically.

✅ **Auth middleware** — `middleware/auth.js` already attaches `req.user = { id, auth_id, role }` on every authenticated route. `id` is the public.users bigint. Use this for all FK writes.

✅ **Pattern library** — `routes/notes.js` has `toggleInteraction()` (line 52) and `routes/activities.js` has `writeActivity()` (line 57). Both are the patterns to mirror.

✅ **Server mount** — `server.js` already imports `questionsRoutes` and mounts it at `/api/questions` (line 41 + 56). The stub file just needs to be expanded.

✅ **Companion spec** — `SPEC — Q&A FRONTEND browse-community.js.md` is being implemented in parallel. The frontend depends on the request/response shapes defined in §1.3.

---

## 1. File structure

Replace the 14-line stub at `routes/questions.js` with a ~450-line file structured like `routes/notes.js`:

```js
const express = require('express')
const router = express.Router()
const { supabase, supabaseAdmin } = require('../supabase')
const auth = require('../middleware/auth')
const { writeActivity } = require('./activities')   // reuse, do NOT redefine

// ─── Constants ───
const STATUS = { ANSWERED: 'answered', UNANSWERED: 'unanswered' }
const ALLOWED_UPLOAD_ROLES = ['limited', 'verified', 'admin']
const DENORM_LIKES_RETRY = { attempts: 3, delays: [25, 50, 75] }  // same as notes.js

// ─── Helpers ───
async function readDenormCount(table, idField, idValue, denormColumn) {
  // copy from notes.js: read after trigger with retry-with-backoff
}

// ─── Routes ───
router.post('/', auth, ...)              // POST /api/questions
router.get('/', ...)                     // GET /api/questions
router.get('/:id', ...)                  // GET /api/questions/:id
router.post('/:id/like', auth, ...)      // POST /api/questions/:id/like
router.post('/:id/answer', auth, ...)    // POST /api/questions/:id/answer
router.post('/:id/accept', auth, ...)    // POST /api/questions/:id/accept
router.post('/answers/:id/like', auth, ...)  // POST /api/answers/:id/like

module.exports = router
```

**Import `writeActivity` from `routes/activities.js` rather than redefining it.** Per the recent-activities Phase 2 work, that helper already handles the `supabaseAdmin` choice and the `description` NOT NULL fallback. Single source of truth.

---

## 2. The 7 routes

### `POST /api/questions` — create a question

- Auth: required + role gate (`limited`/`verified`/`admin` — same gate as `POST /api/notes`)
- Body: `{ title, body, subject_id (int), school_id (int, optional), grade_level (string, optional), tags (string[], optional) }`
- Behavior:
  1. Validate required fields (title, body, subject_id)
  2. INSERT into `questions` (user_id = req.user.id, status = 'unanswered')
  3. If `tags` provided, INSERT into `question_tags` (one row per tag — use a single multi-row INSERT)
  4. Return 201 `{ message, question }`
  5. `writeActivity(req.user.id, 'question_asked', question.id, 'Question asked')`
- Error handling: 400 on validation, 401 on missing auth, 403 on role gate, 500 on DB error

### `GET /api/questions` — list with filters

- Auth: public
- Query params: `subject_id`, `school_id`, `grade_level`, `status` (`unanswered`/`answered`), `tag` (exact match), `tab` (`unanswered`/`answered`/`my_questions`), `user_id` (when `tab=my_questions` or explicit), `limit` (default 20, max 100), `offset` (default 0)
- Behavior:
  1. Build Supabase query with filters
  2. For `tag` filter: use subquery `id IN (SELECT question_id FROM question_tags WHERE tag = ?)`
  3. For `my_questions` tab: require auth (401 if anonymous), filter `user_id = req.user.id`
  4. Return 200 `{ questions: [...], pagination: { total, limit, offset, has_more } }`
  5. Each row should include nested `users: { user_name, role }` and `subjects: { subject_name }` via PostgREST embed
- Response shape (consistent with `GET /api/notes`):
  ```js
  {
    questions: [
      {
        id, title, body, status, created_at, points,
        likes_count, answers_count,
        user_id, subject_id, school_id, grade_level,
        users: { user_name, role },
        subjects: { subject_name },
        // tags joined via a separate fetch (see §5)
      }
    ],
    pagination: { total, limit, offset, has_more }
  }
  ```

### `GET /api/questions/:id` — single question with answers

- Auth: public
- Behavior:
  1. Fetch question row with `users` and `subjects` embed
  2. Fetch answers for this question with `users` embed, ordered by `is_accepted DESC, likes_count DESC, created_at ASC`
  3. If authed viewer, write `writeActivity(req.user.id, 'question_viewed', id, 'Question viewed')`
  4. Return 200 `{ question: { ...row, tags: [...], answers: [...] } }`
- 404 if question not found

### `POST /api/questions/:id/like` — toggle question like

- Auth: required
- Mirror the `toggleInteraction()` pattern from `routes/notes.js:52-112` exactly:
  1. Verify question exists (404 if not)
  2. Check existing `question_likes` row for `(user_id = req.user.id, question_id = id)`
  3. If exists: DELETE it → return 200 `{ message, liked: false, likes_count }`
  4. If not: INSERT it → return 200 `{ message, liked: true, likes_count }`
  5. After the write, read `questions.likes_count` via `readDenormCount()` with retry-with-backoff (the trigger fires asynchronously; the read may catch a pre-trigger state)
  6. On ON-transition (not off), `writeActivity(req.user.id, 'question_liked', id, 'Question liked')`
- **Do NOT manually increment `questions.likes_count`** — the trigger handles it.

### `POST /api/questions/:id/answer` — add an answer

- Auth: required + role gate (same as POST question)
- Body: `{ content }`
- Behavior:
  1. Validate `content` (non-empty, max 5000 chars)
  2. Verify question exists (404 if not)
  3. INSERT into `answers` (user_id = req.user.id, question_id = id, content, is_accepted: false)
  4. The trigger fires `questions.answers_count` automatically — do NOT manually increment
  5. Return 201 `{ message, answer }`
  6. `writeActivity(req.user.id, 'question_answered', questionId, 'Question answered')`
- Note: do NOT change `questions.status` here. The `accept_answer` RPC handles the status flip when an answer is accepted. (Otherwise every new answer would auto-flip the question to 'answered' even before the asker picks.)

### `POST /api/answers/:id/like` — toggle answer like

- Auth: required
- Identical pattern to `POST /api/questions/:id/like` but:
  - Table: `answer_likes`
  - Column: `answers.likes_count`
  - Activity type: `answer_liked`
  - Target for activity log: the answer_id, with description mentioning the question_id for context

### `POST /api/questions/:id/accept` — asker accepts an answer

- Auth: required (asker only)
- Body: `{ answer_id }`
- Behavior:
  1. Fetch the question — confirm `question.user_id === req.user.id` (return 403 if not)
  2. Confirm the answer exists AND `answer.question_id === id` (return 400 if not, to prevent accepting an answer from a different question)
  3. Call `supabase.rpc('accept_answer', { p_question_id: id, p_answer_id: answer_id })`
  4. Return 200 `{ message }`
- **Do NOT do a manual UPDATE on `is_accepted` anywhere.** Always go through the RPC. The RPC handles atomicity (one-per-question guarantee) and the `status` flip.

**Verify the RPC before relying on the status flip.** In Supabase SQL editor, run:
```sql
SELECT pg_get_functiondef('public.accept_answer(bigint, bigint)'::regprocedure);
```
If the function body does NOT include `UPDATE questions SET status = 'answered' ...`, the backend chat needs to add it (or document that the status flip happens on the next read). The frontend's "Answered/Unanswered" tab depends on this being correct.

---

## 3. Request/response shape summary

| Endpoint | Auth | Request | Response |
|---|---|---|---|
| `POST /api/questions` | required + role | `{ title, body, subject_id, school_id?, grade_level?, tags? }` | 201 `{ message, question }` |
| `GET /api/questions` | public | query params | 200 `{ questions[], pagination }` |
| `GET /api/questions/:id` | public | — | 200 `{ question: { ...row, tags, answers } }` |
| `POST /api/questions/:id/like` | required | — | 200 `{ message, liked, likes_count }` |
| `POST /api/questions/:id/answer` | required + role | `{ content }` | 201 `{ message, answer }` |
| `POST /api/answers/:id/like` | required | — | 200 `{ message, liked, likes_count }` |
| `POST /api/questions/:id/accept` | required (asker) | `{ answer_id }` | 200 `{ message }` |

---

## 4. Tags handling

Two strategies for the GET endpoints:

**Option A (simpler):** Don't join tags in the SELECT. Add a separate fetch step in the GET handler that does `SELECT question_id, tag FROM question_tags WHERE question_id IN (...)` and merges the results into the response.

**Option B (preferred):** Use PostgREST's `:question_tags` embed. Supabase-js syntax:
```js
.select('*, users:user_id(user_name, role), subjects:subject_id(subject_name), question_tags(tag)')
```
Then the response rows have `question_tags: [{ tag: 'Physics' }, ...]`. Flatten in the response.

**Pick Option B** if the foreign-key relationship exists in Supabase's auto-generated schema. If the embed fails, fall back to Option A.

---

## 5. RLS / supabaseAdmin decisions

| Endpoint | supabase or supabaseAdmin? | Why |
|---|---|---|
| `POST /api/questions` | supabase | User's own INSERT via own-user RLS policy |
| `GET /api/questions` | supabase | Public read (anon reads work) |
| `GET /api/questions/:id` | supabase | Public read |
| `POST /api/questions/:id/like` | supabase | User's own INSERT via own-user RLS policy |
| `POST /api/questions/:id/answer` | supabase | User's own INSERT via own-user RLS policy |
| `POST /api/answers/:id/like` | supabase | User's own INSERT via own-user RLS policy |
| `POST /api/questions/:id/accept` | supabase.rpc('accept_answer') | The RPC is SECURITY DEFINER; bypasses RLS |

**No `supabaseAdmin` usage needed in `routes/questions.js`.** Mirrors the notes pattern — `supabaseAdmin` is only used in `routes/activities.js` because the user's `req.user.id` doesn't carry through to the anon Supabase client's auth context, and the activity_log policies require `auth.uid()` to resolve. For Q&A, the user owns the row they're inserting, so `supabase` works.

---

## 6. Files to read before writing

Backend Claude, read these in order before writing `routes/questions.js`:

1. `middleware/auth.js` — verify `req.user` shape
2. `routes/notes.js` — full file, especially lines 27-112 (`toggleInteraction` + helpers), lines 150-235 (POST `/`), lines 380-440 (the two toggle routes)
3. `routes/activities.js` — full file, especially `writeActivity()` at line 57
4. `routes/catalog.js` — for the simple GET pattern (subjects/schools)

---

## 7. Verification checklist (run after implementation, in order)

1. `POST /api/questions` as a logged-in user with role `limited` — expect 201
2. `POST /api/questions` as an anonymous request — expect 401
3. `POST /api/questions` as a `viewer` (no role) — expect 403
4. `GET /api/questions` — expect 200 with 1 question
5. `GET /api/questions?status=unanswered` — expect 200 with the new question
6. `GET /api/questions?status=answered` — expect 200 with empty list
7. `GET /api/questions/:id` as anonymous — expect 200, no `question_viewed` log written
8. `GET /api/questions/:id` as logged-in user — expect 200, `question_viewed` log written
9. `POST /api/questions/:id/like` as logged-in user — expect 200 `{ liked: true, likes_count: 1 }`
10. `POST /api/questions/:id/like` again — expect 200 `{ liked: false, likes_count: 0 }`, verify `questions.likes_count` returned 0 (not stale 1)
11. `POST /api/questions/:id/answer` as logged-in user — expect 201, verify `questions.answers_count` returned 1
12. `POST /api/answers/:id/like` as logged-in user — expect 200, verify `answers.likes_count` returned 1
13. `POST /api/questions/:id/accept` as the asker — expect 200, query DB: `is_accepted=true` on the chosen answer, `questions.status='answered'`
14. `POST /api/questions/:id/accept` as a different user — expect 403
15. `POST /api/questions/:id/accept` with conflicting answer_id — verify only one answer has `is_accepted=true` after

---

## 8. What NOT to do

- **Do NOT** add or modify any RLS policy, GRANT, or SQL migration — schema is closed
- **Do NOT** manually increment `likes_count` / `answers_count` in route code — the triggers handle it
- **Do NOT** do a manual UPDATE on `is_accepted` — use the `accept_answer` RPC
- **Do NOT** reference `answers.status` anywhere — the column was dropped
- **Do NOT** modify `routes/notes.js`, `routes/activities.js`, `routes/auth.js`, `routes/catalog.js`, `middleware/auth.js`, `server.js`, or `supabase.js` — all stable
- **Do NOT** modify any frontend files

---

## 9. When this ships

1. Restart the Node server
2. Run the verification checklist (§7) end-to-end
3. Report results back to the user — including the exact `accept_answer` RPC body (paste the `pg_get_functiondef` output) so the status-flip behavior is documented
4. Commit as one backend commit (likely a single file change)
5. Tell the user the backend is ready for the frontend chat to wire `browse-community.js`

---

**Why:** This is the largest single backend addition in the project since the catalog work. Following the multi-chat workflow (backend → frontend) keeps the work incrementally shippable and verifiable.

**How to apply:** Backend Claude should ship this independently. Once verified, the user can hand `SPEC — Q&A FRONTEND browse-community.js.md` to the frontend Claude.
