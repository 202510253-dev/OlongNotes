// ===================== QUESTIONS =====================
// Q&A routes. Mirrors the patterns in routes/notes.js (toggleInteraction,
// row-after-trigger count read) and routes/activities.js (writeActivity
// reuse for activity_log writes).
//
// Surface area:
//   POST   /api/questions                       (auth + role)   Create a question.
//   GET    /api/questions                       (public)        List with filters.
//   GET    /api/questions/:id                   (public)        Single + answers; logs question_viewed.
//   POST   /api/questions/:id/like              (auth)          Toggle like via question_likes.
//   POST   /api/questions/:id/answer            (auth + role)   Add an answer.
//   POST   /api/questions/:id/accept            (auth, asker)   Accept an answer via accept_answer RPC.
//   POST   /api/questions/:id/report            (auth)          Persist a report on a question.
//   DELETE /api/questions/:id                   (owner or admin) Delete a question.
//
// Answer delete (DELETE /api/answers/:id) lives in routes/answers.js.
//
// The answer-likes route lives in routes/answers.js (mounted at
// /api/answers). Keeping it on its own router keeps the route table
// explicit and matches the request/response shape in the frontend spec.
//
// Counter columns (questions.likes_count, questions.answers_count,
// answers.likes_count) are maintained by triggers on question_likes /
// answer_likes / answers. NEVER manually increment them in route code.
// Read the count back via readDenorm() with retry-with-backoff if a fresh
// value is needed for the response.
//
// Status transitions:
//   - On question INSERT: status = 'unanswered' (default via DB).
//   - On accept_answer RPC: status -> 'answered', is_accepted flipped atomically.
//   - On new answer: status does NOT change (the asker hasn't accepted yet).
//
// activity_log:
//   activity_type has no CHECK constraint (verified 2026-08-06), so
//   question_asked / question_viewed / question_liked / question_answered
//   / answer_liked are all valid strings. writeActivity() handles the
//   service-role insert — do NOT call supabase.from('activity_log') here.

const express = require('express')
const router = express.Router()
const { supabase, supabaseAdmin } = require('../supabase')
const auth = require('../middleware/auth')
const { writeActivity } = require('./activities')

// ---------- Constants ----------
const STATUS = { ANSWERED: 'answered', UNANSWERED: 'unanswered' }
const ALLOWED_UPLOAD_ROLES = ['limited', 'verified', 'admin']
const PAGE_LIMIT_DEFAULT = 20
const PAGE_LIMIT_MAX = 100

// ---------- Education-level bucket ----------
// Per the 2026-08-06 confirmation: questions.grade_level is free-text
// (mirrors notes.grade_level — same upload form). The accepted strings
// observed in routes/notes.js:173 are "Grade 7" through "Grade 12".
// College questions use either "College" or "Year N" style strings.
//
// Until a real migration lands, we derive the 3-bucket K-10 / Senior High
// / College grouping at query time. Accepted aliases are listed
// explicitly so a future rename only touches this one helper.
const GRADE_LEVEL_ALIASES = {
  k10: ['Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
        'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
        'K', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10'],
  senior_high: ['Grade 11', 'Grade 12', 'G11', 'G12', 'SHS'],
  college: ['College', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5',
            '1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year',
            'Y1', 'Y2', 'Y3', 'Y4', 'Y5'],
}

function gradeLevelsForBucket(bucket) {
  return GRADE_LEVEL_ALIASES[bucket] || []
}

// Derives the question title from the first ~70 chars of the body,
// truncating at a word boundary and appending '...' when cut short.
function deriveTitle(body) {
  const trimmed = body.trim()
  if (trimmed.length <= 70) return trimmed
  const slice = trimmed.slice(0, 70)
  const lastSpace = slice.lastIndexOf(' ')
  const truncated = lastSpace > 0 ? slice.slice(0, lastSpace) : slice
  return truncated + '...'
}

// ---------- Helpers ----------

// Reads the denormalized counter on the parent row (questions.likes_count /
// questions.answers_count / answers.likes_count). Used as the last-resort
// fallback when the direct join-table count read is suspicious.
//
// The trigger that maintains the denormalized column fires AFTER the
// INSERT/DELETE on the join table, but there's a small race window
// before the response is visible to the next PostgREST call. This
// mirrors the same read-after-write pattern used in routes/notes.js.
async function readDenorm(table, idColumn, idValue, denormColumn) {
  const { data: row } = await supabase
    .from(table)
    .select(denormColumn)
    .eq(idColumn, idValue)
    .single()
  const v = row && row[denormColumn]
  return typeof v === 'number' ? v : 0
}

// ---------- Points ----------
// Points system (Phase 4.0):
//   +2  asker     when a question is created
//   +10 answerer  when their answer is accepted
//   +1  answerer  per like on their answer
//   +1  asker     per like on their question  (mirror of the answer rule)
//
// Writes via supabaseAdmin (service role) because the anon PostgREST
// connection on the backend can't satisfy the RLS USING clause for an
// arbitrary user_id. Read-then-write is safe under Q&A traffic scale
// (low concurrency, human-scale). Worst case is dropping a few points
// — not corrupting the row. NEVER throws: a points failure is logged
// and the user-facing action still succeeds.
async function awardPoints(userId, delta) {
  if (!userId || !delta) return { skipped: true }
  try {
    const { data: row, error: readError } = await supabaseAdmin
      .from('users')
      .select('points')
      .eq('id', userId)
      .maybeSingle()
    if (readError) {
      console.error('[questions] points read error:', readError)
      return { error: readError }
    }
    const current = (row && row.points) || 0
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ points: current + delta })
      .eq('id', userId)
    if (updateError) {
      console.error('[questions] points update error:', updateError)
      return { error: updateError }
    }
    return { ok: true, value: current + delta }
  } catch (err) {
    console.error('[questions] awardPoints exception:', err)
    return { error: err }
  }
}

// Shared toggle helper for question_likes and answer_likes. Identical
// shape to the one in routes/notes.js, but reads from question_likes /
// answer_likes and the denormalized column is on questions / answers
// instead of notes.
//
// On the ON transition only, fire-and-forget writeActivity with the
// matching event string. The activity log is best-effort — never throws.
async function toggleQuestionInteraction(req, res, {
  table,        // 'question_likes' | 'answer_likes'
  idField,      // FK column on the join table (question_id | answer_id)
  parentTable,  // 'questions' | 'answers' — the row that owns the denorm column
  parentIdField,// PK column on parent (id)
  denormColumn, // likes_count on parent
  ownerIdField, // 'user_id' on parent — the recipient of the +1 like points
  activityType  // 'question_liked' | 'answer_liked'
}) {
  const parentId = parseInt(req.params.id)
  const userId = req.user.id

  if (!parentId || Number.isNaN(parentId)) {
    return res.status(400).json({ message: 'Invalid id.' })
  }

  try {
    const { data: existing } = await supabase
      .from(table)
      .select('id')
      .eq(idField, parentId)
      .eq('user_id', userId)
      .maybeSingle()

    // Resolve the parent owner's user_id once, before any writes. We
    // need it to award the +1 like points to the right person on the
    // ON transition. Reading once and reusing beats issuing a second
    // round-trip per toggle.
    const { data: parentRow } = await supabase
      .from(parentTable)
      .select(ownerIdField)
      .eq(parentIdField, parentId)
      .maybeSingle()
    const ownerId = parentRow ? parentRow[ownerIdField] : null

    if (existing) {
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .eq(idField, parentId)
        .eq('user_id', userId)

      if (deleteError) {
        console.error(`[questions] ${table} delete error:`, deleteError)
        return res.status(500).json({ message: `Could not remove ${activityType.replace('_', ' ')}.` })
      }
    } else {
      const { error: insertError } = await supabase
        .from(table)
        .insert({
          [idField]: parentId,
          user_id: userId,
          created_at: new Date().toISOString(),
        })

      if (insertError && insertError.code !== '23505') {
        console.error(`[questions] ${table} insert error:`, insertError)
        return res.status(500).json({ message: `Could not record ${activityType.replace('_', ' ')}.` })
      }

      // Record the like in the activity log — ON transition only.
      // writeActivity is fire-and-forget; never throws.
      writeActivity(userId, activityType, parentId, null)

      // Points — +1 to the parent owner, unless the liker IS the
      // owner (don't let users farm points from self-likes).
      if (ownerId && ownerId !== userId) {
        awardPoints(ownerId, 1)
      }
    }

    // Read the denormalized counter after the trigger has had a chance
    // to fire. Retry up to 3 times with small backoff to ride out the
    // PostgREST connection-pool race window.
    let count = await readDenorm(parentTable, parentIdField, parentId, denormColumn)
    for (let attempt = 1; attempt <= 3; attempt++) {
      await new Promise((r) => setTimeout(r, 25 * attempt))
      const next = await readDenorm(parentTable, parentIdField, parentId, denormColumn)
      if (next === count) break
      count = next
    }

    const likeKey = activityType === 'question_liked' ? 'liked' : 'liked'
    return res.status(200).json({
      message: existing ? 'Removed.' : 'Recorded.',
      [likeKey]: !existing,
      [denormColumn]: count,
    })
  } catch (err) {
    console.error(`[questions] ${table} toggle error:`, err)
    return res.status(500).json({ message: 'Server error.' })
  }
}

// Opportunistically resolve the viewer's public.users bigint id from a
// Bearer JWT if present. Mirrors routes/notes.js:335-384. Returns null
// for anonymous viewers — they get the question/answer list without
// viewer-specific flags and without an activity_log entry.
async function resolveViewerUserId(req) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.split(' ')[1]
  try {
    const { data: { user: authUser } } = await supabase.auth.getUser(token)
    if (!authUser) return null
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', authUser.id)
      .maybeSingle()
    return profile?.id || null
  } catch {
    return null
  }
}

// ---------- POST /api/questions ----------
//
// Body: { body, subject_id (int), grade_level (string), tags (string[]?) }
// Auth: required + role gate (limited / verified / admin).
//
// Phase 4.0 mockup — the ask modal exposes a Grade Level dropdown of
// specific grade strings (Grade 9 through 4th Year College), so the
// frontend sends grade_level directly. The backend stores the grade
// string verbatim; the GET filter derives the 3-bucket education_level
// grouping via GRADE_LEVEL_ALIASES at read time.
//
// For backward compat with the previous Phase 4.0 ask modal that sent
// { education_level: 'k10' | 'senior_high' | 'college' }, we accept that
// too and map it to a representative grade_level string. New callers
// should send grade_level, not education_level.
//
// Behavior:
//   1. Validate required fields.
//   2. INSERT into questions (user_id = req.user.id).
//   3. If tags provided (array of strings), INSERT into question_tags.
//   4. writeActivity('question_asked') — fire-and-forget.
const BUCKET_TO_GRADE = {
  // Legacy fallback for callers that still send education_level buckets.
  k10: 'Grade 7',
  senior_high: 'Grade 11',
  college: 'College',
}

router.post('/', auth, async (req, res) => {
  if (!ALLOWED_UPLOAD_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Only contributors can ask questions.' })
  }

  const { body, subject_id, education_level, grade_level, tags } = req.body || {}

  if (!body || typeof body !== 'string' || body.trim().length === 0) {
    return res.status(400).json({ message: 'Question body is required.' })
  }
  const subjectId = parseInt(subject_id)
  if (!subjectId || Number.isNaN(subjectId)) {
    return res.status(400).json({ message: 'subject_id is required.' })
  }

  // Resolve the grade_level write value. Prefer an explicit grade_level
  // string (Phase 4.0 ask modal — Grade 9 through 4th Year College). Fall
  // back to mapping a legacy education_level bucket to a representative
  // grade_level. Either field is sufficient; both missing leaves
  // grade_level NULL.
  let gradeLevelWrite = null
  if (grade_level && typeof grade_level === 'string' && grade_level.trim().length > 0) {
    gradeLevelWrite = grade_level.trim().slice(0, 50)
  } else if (education_level && BUCKET_TO_GRADE[String(education_level)]) {
    gradeLevelWrite = BUCKET_TO_GRADE[String(education_level)]
  }

  const title = deriveTitle(body)

  // Defensive normalization
  const cleanTags = Array.isArray(tags)
    ? tags.map((t) => String(t).trim()).filter((t) => t.length > 0 && t.length <= 50).slice(0, 10)
    : []

  try {
    const { data: question, error: insertError } = await supabase
      .from('questions')
      .insert({
        user_id: req.user.id,
        subject_id: subjectId,
        school_id: req.body.school_id ? parseInt(req.body.school_id) : null,
        grade_level: gradeLevelWrite,
        title,
        body: body.trim(),
        status: STATUS.UNANSWERED,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError || !question) {
      console.error('[questions] insert error:', insertError)
      return res.status(500).json({ message: 'Could not create question.' })
    }

    // Insert tags as separate rows in question_tags. Single multi-row
    // INSERT for atomicity — either all land or none do.
    if (cleanTags.length > 0) {
      const tagRows = cleanTags.map((tag) => ({
        question_id: question.id,
        tag,
      }))
      const { error: tagError } = await supabase
        .from('question_tags')
        .insert(tagRows)

      if (tagError) {
        console.error('[questions] tag insert error:', tagError)
        // Non-fatal — the question is created; the user sees the
        // question without tags. Don't roll back the question INSERT.
      }
    }

    // Activity log — question_asked. Fire-and-forget.
    writeActivity(req.user.id, 'question_asked', question.id, `Question: ${question.title}`)

    // Points — asker earns +2 for asking. Fire-and-forget.
    awardPoints(req.user.id, 2)

    return res.status(201).json({ message: 'Question created.', question })
  } catch (err) {
    console.error('[questions] POST error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// ---------- GET /api/questions ----------
//
// Query params (all optional):
//   subject_id     int
//   school_id      int
//   grade_level    string
//   status         'unanswered' | 'answered'
//   tag            string (exact match)
//   tab            'unanswered' | 'answered' | 'my_questions'
//   user_id        int (explicit; 'my_questions' filters by req.user.id)
//   limit          page size (default 20, max 100)
//   offset         page offset (default 0)
//
// Returns: { questions: [...], pagination: { total, limit, offset, has_more } }
//
// Each question row includes:
//   id, title, body, status, created_at, points,
//   likes_count, answers_count,
//   user_id, subject_id, school_id, grade_level,
//   users: { user_name, role },
//   subjects: { subject_name }
//   tags: string[]  (flattened from question_tags; fetched separately
//                    since the FK embed can vary by Supabase config —
//                    Option A pattern, simpler and reliable)
router.get('/', async (req, res) => {
  const {
    subject_id,
    school_id,
    grade_level,
    education_level,
    status,
    tag,
    tab,
    user_id,
  } = req.query

  const pageLimit = Math.min(parseInt(req.query.limit) || PAGE_LIMIT_DEFAULT, PAGE_LIMIT_MAX)
  const pageOffset = parseInt(req.query.offset) || 0

  // 'my_questions' requires auth — return 401 instead of leaking whether
  // the user is anonymous.
  let viewerUserId = null
  if (tab === 'my_questions') {
    viewerUserId = await resolveViewerUserId(req)
    if (!viewerUserId) {
      return res.status(401).json({ message: 'Log in to see your questions.' })
    }
  }

  try {
    let query = supabase
      .from('questions')
      .select(`
        id,
        user_id,
        subject_id,
        school_id,
        grade_level,
        title,
        body,
        status,
        points,
        likes_count,
        answers_count,
        created_at,
        users:user_id ( user_name, role ),
        subjects:subject_id ( subject_name )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(pageOffset, pageOffset + pageLimit - 1)

    if (subject_id) query = query.eq('subject_id', parseInt(subject_id))
    if (school_id) query = query.eq('school_id', parseInt(school_id))
    if (grade_level) query = query.eq('grade_level', String(grade_level))

    // education_level filter (k10 | senior_high | college).
    // questions has NO education_level column AND subjects has none either
    // (verified 2026-08-06). Derive the bucket from grade_level free-text
    // via the gradeLevelsForBucket helper. NULL grade_level is EXCLUDED
    // when a bucket filter is active — it only appears in the unfiltered
    // list.
    if (education_level) {
      const allowedLevels = ['k10', 'senior_high', 'college']
      if (!allowedLevels.includes(String(education_level))) {
        return res.status(400).json({
          message: "education_level must be one of: k10, senior_high, college.",
        })
      }
      const gradeLevels = gradeLevelsForBucket(String(education_level))
      if (gradeLevels.length === 0) {
        return res.status(200).json({
          questions: [],
          pagination: { total: 0, limit: pageLimit, offset: pageOffset, has_more: false },
        })
      }
      // Bucket filter active → NULL grade_level rows are excluded, not
      // matched. Ungraded/legacy questions only surface with no bucket set.
      query = query.in('grade_level', gradeLevels)
    }
    if (status) {
      if (![STATUS.ANSWERED, STATUS.UNANSWERED].includes(status)) {
        return res.status(400).json({ message: "status must be 'answered' or 'unanswered'." })
      }
      query = query.eq('status', status)
    } else if (tab === 'unanswered' || tab === 'answered') {
      query = query.eq('status', tab)
    }

    if (tag) {
      // Tag filter via subquery on the join table.
      const { data: tagRows } = await supabase
        .from('question_tags')
        .select('question_id')
        .eq('tag', String(tag))
      const questionIds = (tagRows || []).map((r) => r.question_id)
      if (questionIds.length === 0) {
        return res.status(200).json({
          questions: [],
          pagination: { total: 0, limit: pageLimit, offset: pageOffset, has_more: false },
        })
      }
      query = query.in('id', questionIds)
    }

    // user_id precedence: explicit ?user_id= wins; tab=my_questions uses the viewer.
    if (user_id) {
      query = query.eq('user_id', parseInt(user_id))
    } else if (tab === 'my_questions') {
      query = query.eq('user_id', viewerUserId)
    }

    const { data: rows, error, count } = await query

    if (error) {
      console.error('[questions] list error:', error)
      return res.status(500).json({ message: 'Could not fetch questions.' })
    }

    // Fetch tags for the returned question ids in a separate query.
    // (Simpler than a join embed; reliable across schema cache states.)
    const ids = (rows || []).map((r) => r.id)
    let tagsByQuestionId = {}
    if (ids.length > 0) {
      const { data: tagData } = await supabase
        .from('question_tags')
        .select('question_id, tag')
        .in('question_id', ids)
      for (const t of tagData || []) {
        if (!tagsByQuestionId[t.question_id]) tagsByQuestionId[t.question_id] = []
        tagsByQuestionId[t.question_id].push(t.tag)
      }
    }

    const questions = (rows || []).map((r) => ({
      ...r,
      tags: tagsByQuestionId[r.id] || [],
    }))

    return res.status(200).json({
      questions,
      pagination: {
        total: count,
        limit: pageLimit,
        offset: pageOffset,
        has_more: pageOffset + pageLimit < count,
      },
    })
  } catch (err) {
    console.error('[questions] GET / error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// ---------- GET /api/questions/:id ----------
//
// Public. Returns the question + its answers (ordered by is_accepted DESC,
// likes_count DESC, created_at ASC). If the viewer is authenticated,
// logs a question_viewed activity and includes viewer_has_liked.
router.get('/:id', async (req, res) => {
  const questionId = parseInt(req.params.id)
  if (!questionId || Number.isNaN(questionId)) {
    return res.status(400).json({ message: 'Invalid question id.' })
  }

  try {
    const { data: question, error: qError } = await supabase
      .from('questions')
      .select(`
        id,
        user_id,
        subject_id,
        school_id,
        grade_level,
        title,
        body,
        status,
        points,
        likes_count,
        answers_count,
        created_at,
        users:user_id ( user_name, role ),
        subjects:subject_id ( subject_name )
      `)
      .eq('id', questionId)
      .maybeSingle()

    if (qError) {
      console.error('[questions] fetch error:', qError)
      return res.status(500).json({ message: 'Could not fetch question.' })
    }
    if (!question) {
      return res.status(404).json({ message: 'Question not found.' })
    }

    // Fetch answers + their askers in parallel with the tags fetch.
    const [answersResult, tagsResult] = await Promise.all([
      supabase
        .from('answers')
        .select(`
          id,
          question_id,
          user_id,
          content,
          points,
          likes_count,
          is_accepted,
          created_at,
          users:user_id ( user_name, role )
        `)
        .eq('question_id', questionId)
        .order('is_accepted', { ascending: false })
        .order('likes_count', { ascending: false })
        .order('created_at', { ascending: true }),
      supabase
        .from('question_tags')
        .select('tag')
        .eq('question_id', questionId),
    ])

    if (answersResult.error) {
      console.error('[questions] answers error:', answersResult.error)
      return res.status(500).json({ message: 'Could not fetch answers.' })
    }

    // Resolve viewer flags (liked / asked this) for authenticated viewers.
    const viewerUserId = await resolveViewerUserId(req)
    if (viewerUserId) {
      const [{ data: liked }, { data: askedThis }] = await Promise.all([
        supabase
          .from('question_likes')
          .select('id')
          .eq('question_id', questionId)
          .eq('user_id', viewerUserId)
          .maybeSingle(),
        supabase
          .from('questions')
          .select('id')
          .eq('id', questionId)
          .eq('user_id', viewerUserId)
          .maybeSingle(),
      ])
      question.viewer_has_liked = Boolean(liked)
      question.viewer_is_asker = Boolean(askedThis)

      // Record the view in the activity log — authed viewers only.
      // Anonymous viewers don't pollute the log.
      writeActivity(viewerUserId, 'question_viewed', questionId, null)
    } else {
      question.viewer_has_liked = false
      question.viewer_is_asker = false
    }

    return res.status(200).json({
      question: {
        ...question,
        tags: (tagsResult.data || []).map((t) => t.tag),
        answers: answersResult.data || [],
      },
    })
  } catch (err) {
    console.error('[questions] GET /:id error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// ---------- POST /api/questions/:id/like ----------
//
// Toggle like. Identical pattern to POST /api/notes/:id/like.
router.post('/:id/like', auth, (req, res) =>
  toggleQuestionInteraction(req, res, {
    table: 'question_likes',
    idField: 'question_id',
    parentTable: 'questions',
    parentIdField: 'id',
    denormColumn: 'likes_count',
    ownerIdField: 'user_id',
    activityType: 'question_liked',
  })
)

// ---------- POST /api/questions/:id/answer ----------
//
// Body: { content }
// Auth: required + role gate.
//
// The trigger on answers (question_answers_count_trigger) updates
// questions.answers_count automatically — do NOT manually increment.
// New answers do NOT flip questions.status. That's the accept_answer
// RPC's job.
router.post('/:id/answer', auth, async (req, res) => {
  const questionId = parseInt(req.params.id)
  const content = (req.body || {}).content

  if (!ALLOWED_UPLOAD_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Only contributors can answer questions.' })
  }
  if (!questionId || Number.isNaN(questionId)) {
    return res.status(400).json({ message: 'Invalid question id.' })
  }
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ message: 'Answer content is required.' })
  }
  if (content.length > 5000) {
    return res.status(400).json({ message: 'Answer too long. Max 5000 characters.' })
  }

  try {
    // Verify the question exists. Cheap existence check before insert.
    const { data: exists, error: existsError } = await supabase
      .from('questions')
      .select('id')
      .eq('id', questionId)
      .maybeSingle()

    if (existsError) {
      console.error('[questions] answer existence error:', existsError)
      return res.status(500).json({ message: 'Server error.' })
    }
    if (!exists) {
      return res.status(404).json({ message: 'Question not found.' })
    }

    const { data: answer, error: insertError } = await supabase
      .from('answers')
      .insert({
        question_id: questionId,
        user_id: req.user.id,
        content: content.trim(),
        is_accepted: false,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError || !answer) {
      console.error('[questions] answer insert error:', insertError)
      return res.status(500).json({ message: 'Could not submit answer.' })
    }

    // Activity log — question_answered. Fire-and-forget.
    writeActivity(req.user.id, 'question_answered', questionId, 'Question answered')

    return res.status(201).json({ message: 'Answer submitted.', answer })
  } catch (err) {
    console.error('[questions] answer POST error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// ---------- DELETE /api/questions/:id ----------
//
// Owner or admin only. Cascades clean up answers, question_likes,
// answer_likes, question_tags (FK cascades verified 2026-08-06).
router.delete('/:id', auth, async (req, res) => {
  const questionId = parseInt(req.params.id)
  if (!questionId || Number.isNaN(questionId)) {
    return res.status(400).json({ message: 'Invalid question id.' })
  }

  try {
    const { data: question, error: fetchError } = await supabase
      .from('questions')
      .select('id, user_id, title')
      .eq('id', questionId)
      .maybeSingle()

    if (fetchError) {
      console.error('[questions] delete fetch error:', fetchError)
      return res.status(500).json({ message: 'Server error.' })
    }
    if (!question) {
      return res.status(404).json({ message: 'Question not found.' })
    }
    if (question.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You can only delete your own questions.' })
    }

    const { error: deleteError } = await supabase
      .from('questions')
      .delete()
      .eq('id', questionId)

    if (deleteError) {
      console.error('[questions] delete error:', deleteError)
      return res.status(500).json({ message: 'Could not delete question.' })
    }

    return res.status(200).json({ message: 'Question deleted.' })
  } catch (err) {
    console.error('[questions] DELETE error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// ---------- DELETE /api/answers/:id ----------
//
// Owner of the answer, owner of the parent question, or admin lives in
// routes/answers.js — DELETE /api/answers/:id. Same FK cascades handle
// cleanup of answer_likes.

// ---------- POST /api/questions/:id/report ----------
//
// Auth required. Persists to the `reports` table (verified schema
// 2026-08-06) and emits a question_reported activity row.
router.post('/:id/report', auth, async (req, res) => {
  const questionId = parseInt(req.params.id)
  const reason = (req.body || {}).reason

  if (!questionId || Number.isNaN(questionId)) {
    return res.status(400).json({ message: 'Invalid question id.' })
  }
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return res.status(400).json({ message: 'A reason is required to report a question.' })
  }
  if (reason.length > 500) {
    return res.status(400).json({ message: 'Reason too long. Max 500 characters.' })
  }

  try {
    const { data: exists } = await supabase
      .from('questions')
      .select('id')
      .eq('id', questionId)
      .maybeSingle()

    if (!exists) {
      return res.status(404).json({ message: 'Question not found.' })
    }

    const { data: report, error } = await supabase
      .from('reports')
      .insert({
        reporter_id: req.user.id,
        target_type: 'question',
        target_id: questionId,
        reason: reason.trim(),
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('[questions] report insert error:', error)
      return res.status(500).json({ message: 'Could not submit report.' })
    }

    // Best-effort activity log entry — does not affect the response.
    writeActivity(req.user.id, 'question_reported', questionId, reason.trim())

    return res.status(201).json({
      message: 'Report submitted. Our team will review it.',
      report_id: report.id,
    })
  } catch (err) {
    console.error('[questions] report POST error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// ---------- POST /api/questions/:id/accept ----------
//
// Body: { answer_id }
// Auth: required (asker only).
//
// The accept_answer RPC atomically:
//   1. Sets is_accepted = false on any previously-accepted answer for this question.
//   2. Sets is_accepted = true on the chosen answer (verified to be for
//      this question via the RPC's internal check or the FK constraint).
//   3. Sets questions.status = 'answered'.
// DO NOT do a manual UPDATE on is_accepted anywhere — always go through
// the RPC to preserve atomicity.
router.post('/:id/accept', auth, async (req, res) => {
  const questionId = parseInt(req.params.id)
  const answerId = (req.body || {}).answer_id

  if (!questionId || Number.isNaN(questionId)) {
    return res.status(400).json({ message: 'Invalid question id.' })
  }
  if (!answerId || Number.isNaN(parseInt(answerId))) {
    return res.status(400).json({ message: 'answer_id is required.' })
  }

  try {
    // Fetch the question — confirm req.user.id is the asker.
    const { data: question, error: qError } = await supabase
      .from('questions')
      .select('id, user_id')
      .eq('id', questionId)
      .maybeSingle()

    if (qError) {
      console.error('[questions] accept fetch error:', qError)
      return res.status(500).json({ message: 'Server error.' })
    }
    if (!question) {
      return res.status(404).json({ message: 'Question not found.' })
    }
    if (question.user_id !== req.user.id) {
      return res.status(403).json({ message: 'Only the asker can accept an answer.' })
    }

    // Confirm the answer exists AND belongs to this question (defense in
    // depth — the FK should already enforce this but better to fail with
    // a clean 400 than to trust the RPC to handle it). user_id is
    // fetched here so we can award +10 points to the answerer below.
    const { data: answer, error: aError } = await supabase
      .from('answers')
      .select('id, question_id, user_id')
      .eq('id', parseInt(answerId))
      .maybeSingle()

    if (aError) {
      console.error('[questions] accept answer fetch error:', aError)
      return res.status(500).json({ message: 'Server error.' })
    }
    if (!answer) {
      return res.status(404).json({ message: 'Answer not found.' })
    }
    if (answer.question_id !== questionId) {
      return res.status(400).json({ message: 'Answer does not belong to this question.' })
    }

    // Atomic flip — go through the RPC. The RPC may also update
    // questions.status = 'answered' (verified live 2026-08-06).
    const { error: rpcError } = await supabase.rpc('accept_answer', {
      p_question_id: questionId,
      p_answer_id: parseInt(answerId),
    })

    if (rpcError) {
      console.error('[questions] accept_answer RPC error:', rpcError)
      return res.status(500).json({ message: 'Could not accept answer.' })
    }

    // Points — answerer earns +10 when their answer is accepted.
    // Skip if the answerer is the asker (defensive; should never happen
    // since we verified question.user_id === req.user.id above).
    if (answer.user_id && answer.user_id !== req.user.id) {
      awardPoints(answer.user_id, 10)
    }

    return res.status(200).json({ message: 'Answer accepted.' })
  } catch (err) {
    console.error('[questions] accept error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
