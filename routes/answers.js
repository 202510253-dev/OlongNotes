// ===================== ANSWERS =====================
// The answer-likes route + answer delete. Lives on its own router
// (mounted at /api/answers) so the URLs are:
//   POST   /api/answers/:id/like     (auth)    Toggle like via answer_likes.
//   DELETE /api/answers/:id          (owner or asker or admin) Delete.
//
// POST /api/answers/:id/like mirrors POST /api/questions/:id/like
// exactly. See routes/questions.js for the full pattern notes.
//
// Counter column: answers.likes_count. Maintained by
// answer_likes_count_trigger — do NOT manually increment.
// Activity type: answer_liked.

const express = require('express')
const router = express.Router()
const { supabase } = require('../supabase')
const auth = require('../middleware/auth')
const { toggleQuestionInteraction } = require('./questions')

// ---------- POST /api/answers/:id/like ----------
router.post('/:id/like', auth, (req, res) =>
  toggleQuestionInteraction(req, res, {
    table: 'answer_likes',
    idField: 'answer_id',
    parentTable: 'answers',
    parentIdField: 'id',
    denormColumn: 'likes_count',
    ownerIdField: 'user_id',
    activityType: 'answer_liked',
  })
)

// ---------- DELETE /api/answers/:id ----------
//
// Owner of the answer, owner of the parent question, or admin. FK
// cascades handle cleanup of answer_likes. questions.answers_count is
// maintained by the answers trigger — no manual decrement needed.
router.delete('/:id', auth, async (req, res) => {
  const answerId = parseInt(req.params.id)
  if (!answerId || Number.isNaN(answerId)) {
    return res.status(400).json({ message: 'Invalid answer id.' })
  }

  try {
    const { data: answer, error: aError } = await supabase
      .from('answers')
      .select('id, user_id, question_id')
      .eq('id', answerId)
      .maybeSingle()

    if (aError) {
      console.error('[answers] delete fetch error:', aError)
      return res.status(500).json({ message: 'Server error.' })
    }
    if (!answer) {
      return res.status(404).json({ message: 'Answer not found.' })
    }

    // Ownership rules — answerer, asker, or admin only.
    const isOwner = answer.user_id === req.user.id
    let isAsker = false
    if (!isOwner) {
      const { data: parent } = await supabase
        .from('questions')
        .select('user_id')
        .eq('id', answer.question_id)
        .maybeSingle()
      isAsker = parent && parent.user_id === req.user.id
    }

    if (!isOwner && !isAsker && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You cannot delete this answer.' })
    }

    const { error: deleteError } = await supabase
      .from('answers')
      .delete()
      .eq('id', answerId)

    if (deleteError) {
      console.error('[answers] delete error:', deleteError)
      return res.status(500).json({ message: 'Could not delete answer.' })
    }

    return res.status(200).json({ message: 'Answer deleted.' })
  } catch (err) {
    console.error('[answers] DELETE error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
