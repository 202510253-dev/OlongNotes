# SPEC — Q&A frontend: `browse-community.js`

**Date:** 2026-08-06
**From:** Local Claude (read-only analyzer, on behalf of the user)
**For:** Frontend Claude (code-modifier for the frontend)
**Repo:** `C:\Users\Opriasa\Desktop\OlongNotes_off\olongnotes\` (Express + Supabase)
**HEAD at handoff:** `cc9bc0b` (main, in sync with origin/main, working tree clean)
**Companion spec:** `SPEC — Q&A BACKEND routes.questions.js.md` — must be implemented first (the frontend depends on the API contract)

---

## 0. Status — what's already verified

✅ **Backend API** — `routes/questions.js` will be live by the time you start. The 7 routes follow the request/response shapes in §1.3 of the backend spec.

✅ **API wrapper** — `public/js/api.js` (144 lines) exposes `window.OlongNotes.api.get`, `.post`, `.upload`, and `escapeHtml`. Use this consistently — no raw `fetch()` calls.

✅ **Working pattern** — `public/js/document-viewer.js` (449 lines) is the most recent working example of a live-data page. Mirror its structure.

✅ **Auth gating** — `window.OlongNotes.getToken()` returns the JWT, `window.OlongNotes.applyRole(role)` updates the UI. Use these for the auth-gated actions.

---

## 1. Current state

`public/browse-community.js` is 30,859 bytes, reads from a hardcoded `QUESTIONS_DATA` mock. The page (`community.html`) is a single-page layout with question cards inline (no separate detail page). The prototype's tabs (All / Unanswered / Answered / My Questions) and dropdowns (All Grades / All Subjects / Latest) are visual only — no logic.

---

## 2. What to replace

Replace the file end-to-end. Target structure (~500 lines):

```js
// ─── Constants ───
const TABS = ['all', 'unanswered', 'answered', 'my_questions']
const DEFAULT_SORT = 'latest'
const PAGE_LIMIT = 20

// ─── State ───
const state = {
  questions: [],
  page: 1,
  hasMore: false,
  total: 0,
  tab: 'all',
  filters: { grade: '', subject: '', sort: 'latest' },
  loading: false,
  openQuestionId: null,  // for inline expansion
}

// ─── API helpers ───
async function fetchQuestions() { ... }
async function fetchQuestionDetail(id) { ... }
async function postQuestion(body) { ... }
async function postLike(questionId) { ... }
async function postAnswer(questionId, content) { ... }
async function postAccept(questionId, answerId) { ... }

// ─── Render ───
function renderTabs() { ... }
function renderFilters() { ... }
function renderQuestionList() { ... }      // the list of cards
function renderQuestionDetail(q) { ... }    // inline-expanded view when a card is clicked
function renderEmpty() { ... }
function renderError(msg) { ... }

// ─── Event handlers ───
function bindTabClicks() { ... }
function bindFilterChanges() { ... }
function bindPagination() { ... }
function bindCardClicks() { ... }          // expand/collapse
function bindLikeButtons() { ... }
function bindAnswerForm() { ... }
function bindAcceptButtons() { ... }
function bindAskQuestionModal() { ... }

// ─── Boot ───
document.addEventListener('DOMContentLoaded', async () => {
  await populateFilterDropdowns()  // grades + subjects from /api/subjects, /api/schools
  bindEvents()
  loadQuestions()
})
```

---

## 3. Field mapping (frontend mock → backend columns)

| Mock field | Backend column | Notes |
|---|---|---|
| `id` | `id` | direct |
| `subject` | `subjects.subject_name` (joined) | resolve via embed |
| `grade` | `grade_level` | direct |
| `author` | `users.user_name` (joined) | resolve via embed |
| `timeAgo` | `created_at` | format on frontend with `Intl.RelativeTimeFormat` |
| `status` | `status` | 'answered' / 'unanswered' |
| `likes` | `likes_count` | already plural (post-`adbe84f` fix) |
| `answers` | `answers_count` | denormalized |
| `tags` | `question_tags.tag` (joined array) | |
| `body` | `body` | new column, not in the old mock |
| `acceptedAnswerId` | derived from `answers[].is_accepted` | the answer with `is_accepted: true` |

---

## 4. API contract (the frontend will call these)

Match the response shapes from the backend spec §1.3:

| Endpoint | Request | Response |
|---|---|---|
| `GET /api/questions` | query params | 200 `{ questions[], pagination }` |
| `GET /api/questions/:id` | — | 200 `{ question: { ...row, tags, answers } }` |
| `POST /api/questions` | `{ title, body, subject_id, school_id?, grade_level?, tags? }` | 201 `{ message, question }` |
| `POST /api/questions/:id/like` | — | 200 `{ message, liked, likes_count }` |
| `POST /api/questions/:id/answer` | `{ content }` | 201 `{ message, answer }` |
| `POST /api/answers/:id/like` | — | 200 `{ message, liked, likes_count }` |
| `POST /api/questions/:id/accept` | `{ answer_id }` | 200 `{ message }` |

Use `window.OlongNotes.api.get(path)` and `.post(path, body)` per the existing pattern. No raw `fetch()` calls.

---

## 5. Render rules

- **Tab click** → update `state.tab` → reset `state.page = 1` → `fetchQuestions()` → re-render
- **Filter change** → update `state.filters` → reset `state.page = 1` → `fetchQuestions()` → re-render
- **Card click** → toggle `state.openQuestionId` → if open, fetch detail and render inline, else collapse
- **Like button** → optimistic UI update + `postLike()` → reconcile count from response
- **Answer submit** → POST + on success, re-fetch the question detail to show the new answer
- **Accept button** → only visible to the asker AND only on unanswered questions → `postAccept()` → re-fetch detail
- **Ask question button** → open modal → form submit → POST → on success, prepend the new question to the list and close the modal

---

## 6. XSS audit

Every dynamic field that lands in `innerHTML` MUST be wrapped in `esc()` (which is `window.OlongNotes.escapeHtml`). The seven known offender fields:

1. `question.title`
2. `question.body`
3. `question.users.user_name` (asker)
4. `subject.subject_name` (joined)
5. `answer.content`
6. `answer.users.user_name` (answerer)
7. `question_tags.tag` (hashtag text)

The Phase 2 browse-community.js pre-escape in `ef42cd9` already covers some of these (see lines 632, 637, 640-641, 647-648, 666). Audit once more end-to-end after the rewrite.

---

## 7. Auth gating

Mirror the existing pattern from `document-viewer.js`:
- Anonymous viewer clicks Like → inline banner "Log in to like"
- Anonymous viewer clicks Answer → "Log in to answer"
- Anonymous viewer clicks Ask → auth modal opens in signup mode
- "My Questions" tab → if anonymous, redirect to login OR show inline message

---

## 8. Files to read before writing

Frontend Claude, read these in order before writing `browse-community.js`:

1. `public/js/api.js` — the API wrapper (144 lines, fully stable)
2. `public/js/document-viewer.js` — the most recent working example of a live-data page (449 lines)
3. `public/js/subjects.js` — for the tiered-filter state machine pattern
4. `public/js/script.js` lines 350-430 — for the existing `populateFilters()` + searchBtn pattern (this can be hoisted into a shared helper if the Q&A page needs the same dropdowns)
5. `public/community.html` — for the existing DOM structure (the modal markup, the tab buttons, the dropdowns, the card-per-question markup)
6. `public/css/browse-community.css` — for the existing styles (keep them, just adjust the `esc()` calls)

---

## 9. What NOT to touch

- `community.html` — the structure should not need changes; the JS will re-render the existing elements
- `browse-community.css` — same, no structural changes needed
- Anything outside `browse-community.js`
- Any backend files (no changes to `routes/`, `supabase.js`, etc.)

---

## 10. Verification checklist (run after implementation, in order)

1. Open `community.html` — questions list loads from API, not mock
2. Click Unanswered tab — list filters correctly
3. Click My Questions as anonymous — banner appears, no API call fired
4. Click a question card — inline expansion loads the full question + answers
5. Click Like as anonymous — "Log in to like" banner
6. Click Like as logged-in user — count increments, button state flips
7. Click Answer button — form appears, submit → answer appears in the list
8. Open Ask modal — submit → new question appears at the top
9. Reload page — pagination state resets, dropdowns populated
10. Check all dynamic fields in DevTools → no `&lt;script&gt;` injected, no `undefined` shown

---

## 11. When this ships

1. Test the frontend in the browser (smoke checklist §10)
2. Report results back to the user
3. Commit as one frontend commit (likely a single file change)
4. Tell the user the frontend is ready for end-to-end verification

---

**Why:** This is the largest single frontend rewrite in the project since the catalog work. Following the multi-chat workflow (backend → frontend) keeps the work incrementally shippable and verifiable.

**How to apply:** Frontend Claude should ship this after the backend spec is complete. The backend chat should have left the 7 routes running and verified before the frontend chat starts.
