// ===================== ANSWERS =====================
// The answer-likes route. Lives on its own router (mounted at
// /api/answers) so the URL is /api/answers/:id/like — matches the spec.
//
// Mirrors POST /api/questions/:id/like exactly. See routes/questions.js
// for the full pattern notes.
//
// Counter column: answers.likes_count. Maintained by
// answer_likes_count_trigger — do NOT manually increment.
// Activity type: answer_liked.

const express = require('express')
const router = express.Router()
const { supabase } = require('../supabase')
const auth = require('../middleware/auth')
const { writeActivity } = require('./activities')
const { toggleQuestionInteraction } = require('./questions')

// ---------- POST /api/answers/:id/like ----------
router.post('/:id/like', auth, (req, res) =>
  toggleQuestionInteraction(req, res, {
    table: 'answer_likes',
    idField: 'answer_id',
    parentTable: 'answers',
    parentIdField: 'id',
    denormColumn: 'likes_count',
    activityType: 'answer_liked',
  })
)

module.exports = router
