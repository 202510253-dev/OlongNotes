const express = require('express')
const router = express.Router()
const { supabase, supabaseAdmin } = require('../supabase')
const { body, validationResult } = require('express-validator')
const auth = require('../middleware/auth')
const multer = require('multer')
const { v4: uuidv4 } = require('uuid')

// Status constants — single source of truth
const STATUS = {
  PENDING: 'pending',
  PUBLISHED: 'published',
  REJECTED: 'rejected'
}

// Extracts the storage path from a Supabase public URL
// Returns null if the URL doesn't match the expected format
function parseStoragePath(url) {
  const marker = '/storage/v1/object/public/olongnotes/'
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return url.slice(idx + marker.length) || null
}

// Counts the rows in a join table (likes / bookmarks) for a given note.
// Returns 0 if the count is unavailable. Used by toggleInteraction to
// emit the new count AFTER the INSERT/DELETE — see that function for
// why we read it multiple times.
async function readCount(table, noteId) {
  const { count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('note_id', noteId)
  return typeof count === 'number' ? count : 0
}

// Reads the denormalized counter on `notes` (likes_count or
// bookmarks_count). Used as a last-resort fallback when the direct
// count read is suspicious (e.g. 0 after an INSERT).
async function readDenorm(noteId, column) {
  const { data: row } = await supabase
    .from('notes')
    .select(column)
    .eq('id', noteId)
    .single()
  const v = row && row[column]
  return typeof v === 'number' ? v : null
}

// Shared toggle helper for likes and bookmarks
async function toggleInteraction(req, res, { table, idField, denormColumn }) {
  const noteId = parseInt(req.params.id)
  const userId = req.user.id

  try {
    const { data: existing } = await supabase
      .from(table)
      .select('id')
      .eq('note_id', noteId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) {
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .eq('note_id', noteId)
        .eq('user_id', userId)

      if (deleteError) {
        console.error(`${table} delete error:`, deleteError)
        return res.status(500).json({ message: `Could not remove ${table.slice(0, -1)}.` })
      }
    } else {
      const { error: insertError } = await supabase
        .from(table)
        .insert({ note_id: noteId, user_id: userId, created_at: new Date().toISOString() })

      if (insertError) {
        if (insertError.code !== '23505') {
          console.error(`${table} insert error:`, insertError)
          return res.status(500).json({ message: `Could not ${table.slice(0, -1)} note.` })
        }
      }
    }

    // Read the count AFTER the mutation. There's a small race window
    // between the INSERT/DELETE response and the COUNT query — both go
    // through the PostgREST connection pool, and depending on connection
    // reuse they may or may not see the just-written row. We re-read
    // up to 3 times with a tiny backoff. If all reads agree with the
    // pre-mutation state, we trust them; if any read differs, we trust
    // the most-recent non-zero read. The denormalized column on `notes`
    // is the ultimate source of truth — we fall back to it if the
    // direct count is suspicious (e.g. 0 immediately after an INSERT).
    const preCount = await readCount(table, noteId)
    let count = await readCount(table, noteId)
    for (let attempt = 1; attempt <= 3 && count === preCount; attempt++) {
      await new Promise((r) => setTimeout(r, 25 * attempt))
      count = await readCount(table, noteId)
    }
    // If direct count is 0 after an INSERT (trigger failed silently),
    // fall back to the denormalized column. This is rare but observed.
    if (count === 0 && !existing) {
      const denorm = await readDenorm(noteId, denormColumn)
      if (typeof denorm === 'number') count = denorm
    }

    return res.status(existing ? 200 : 201).json({
      message: existing ? `${idField} removed.` : `Note ${idField}.`,
      [idField]: !existing,
      [denormColumn]: count
    })

  } catch (err) {
    console.error(`${table} toggle error:`, err)
    return res.status(500).json({ message: 'Server error.' })
  }
}

// Multer Confic - Memory storage, validate before the Supabase

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // Strictly 10MB hard limit
    fileFilter: (req, file, cb) => {
        const allowed = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'image/jpeg',
            'image/png'
        ]
        if (allowed.includes(file.mimetype)) {
            cb(null, true)
        } else {
            cb(new Error('File type not allowed'), false)
        }
    }
})

// POST /api/notes - verified or limited only
router.post('/', auth, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return next(err) // passes to global error handler in server.js
    next()
  })
}, async (req, res) => {

  if (!['limited', 'verified', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Only contributors can upload notes.' })
  }

  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded.' })
  }

  const { title, subject_id, school_id, grade_level, annotation } = req.body

  if (!title || !subject_id || !grade_level) {
    return res.status(400).json({ message: 'Title, subject, and grade level are required.' })
  }

  const fileExt = req.file.originalname.split('.').pop()
  const fileName = `${uuidv4()}.${fileExt}`
  const filePath = `notes/${fileName}`

  try {
    // Upload file to Supabase Storage
    const { error: storageError } = await supabase.storage
      .from('olongnotes')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        contentDisposition: 'inline',
        upsert: false
      })

    if (storageError) {
      console.error('Storage upload error:', storageError)
      return res.status(500).json({ message: 'File upload failed. Please try again.' })
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('olongnotes')
      .getPublicUrl(filePath)

    const fileUrl = urlData.publicUrl

    // Save note record to database
    const { data: note, error: dbError } = await supabase
      .from('notes')
      .insert({
        title,
        subject_id: parseInt(subject_id),
        school_id: school_id ? parseInt(school_id) : null,
        grade_level,
        annotation: annotation || null,
        file_url: fileUrl,
        file_type: req.file.mimetype,
        file_size: req.file.size,
        user_id: req.user.id,
        status: req.user.role === 'admin' ? STATUS.PUBLISHED : STATUS.PENDING,
        download_count: 0,
        view_count: 0,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (dbError) {
      console.error('DB insert error:', dbError)
      await supabase.storage
        .from('olongnotes')
        .remove([filePath])
      return res.status(500).json({ message: 'Could not save note. Please try again.' })
    }

    return res.status(201).json({
      message: 'Note uploaded successfully. It will appear after admin review.',
      note
    })

  } catch (err) {
    console.error('Upload error:', err)
    // Also attempt cleanup on unexpected errors
    await supabase.storage.from('olongnotes').remove([filePath]).catch(() => {})
    return res.status(500).json({ message: 'Server error. Please try again.' })
  }
})

// GET /api/notes - public, no auth required
//
// Query params (all optional, combine freely):
//   limit         page size (default 20, max 100)
//   offset        page offset (default 0)
//   school        school NAME (legacy filter; prefer school_id below)
//   school_id     school ID (used by catalog pages; takes precedence)
//   subject       subject NAME (legacy filter; prefer subject_id below)
//   subject_id    subject ID (used by catalog pages; takes precedence)
//   grade_level   exact-grade filter
//   file_type     exact-MIME filter
router.get('/', async (req, res) => {
  const { school, grade_level, subject, file_type, school_id, subject_id } = req.query

  // Pagination — default 20 per page, max 100
  const pageLimit = Math.min(parseInt(req.query.limit) || 20, 100)
  const pageOffset = parseInt(req.query.offset) || 0

  try {
    let query = supabase
      .from('notes')
      .select(`
        id,
        title,
        annotation,
        file_url,
        file_type,
        file_size,
        grade_level,
        download_count,
        view_count,
        likes_count,
        bookmarks_count,
        created_at,
        status,
        users ( user_name ),
        schools ( school_name ),
        subjects ( subject_name )
      `, { count: 'exact' })
      .eq('status', STATUS.PUBLISHED)
      .order('created_at', { ascending: false })
      .range(pageOffset, pageOffset + pageLimit - 1)

    // school_id takes precedence over school (the latter matches by name
    // and only exists for backward compatibility with older callers).
    if (school_id) query = query.eq('school_id', parseInt(school_id))
    else if (school) query = query.eq('school_id', parseInt(school))

    if (grade_level) query = query.eq('grade_level', grade_level)

    // subject_id takes precedence over subject.
    if (subject_id) query = query.eq('subject_id', parseInt(subject_id))
    else if (subject) query = query.eq('subject_id', parseInt(subject))

    if (file_type) query = query.eq('file_type', file_type)

    const { data: notes, error, count } = await query

    if (error) {
      console.error('Fetch notes error:', error)
      return res.status(500).json({ message: 'Could not fetch notes.' })
    }

    return res.status(200).json({
      notes,
      pagination: {
        total: count,
        limit: pageLimit,
        offset: pageOffset,
        has_more: (pageOffset + pageLimit) < count
      }
    })

  } catch (err) {
    console.error('GET /api/notes error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/notes/:id - public, increments view_count
//
// If a valid auth token is present, the response also carries
// `viewer_has_liked` and `viewer_has_bookmarked` so the viewer UI can
// pre-set the like/bookmark buttons on page load (otherwise they'd
// always show the inactive state, which is misleading when the user
// has already liked the note). The route stays public — the auth
// token is parsed opportunistically, never required.
router.get('/:id', async (req, res) => {
    const { id } = req.params

    try {
        const { data: note, error } = await supabase
            .from('notes')
            .select(`
        id,
        title,
        annotation,
        file_url,
        file_type,
        file_size,
        grade_level,
        download_count,
        view_count,
        likes_count,
        bookmarks_count,
        created_at,
        status,
        users ( user_name ),
        schools ( school_name ),
        subjects ( subject_name )
      `)
            .eq('id', parseInt(id))
            .eq('status', STATUS.PUBLISHED)
            .single()

        if (error || !note) {
            return res.status(404).json({ message: 'Note not found.' })
        }

        // Opportunistically resolve the viewer's user id from the JWT
        // if present. Never rejects — unauthenticated viewers see the
        // note without the per-user flags.
        let viewerUserId = null
        const authHeader = req.headers.authorization
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.split(' ')[1]
          const { data: { user: authUser } } = await supabase.auth.getUser(token)
          if (authUser) {
            const { data: profile } = await supabase
              .from('users')
              .select('id')
              .eq('auth_id', authUser.id)
              .single()
            if (profile) viewerUserId = profile.id
          }
        }

        // Run the two "has the viewer done X" lookups in parallel.
        if (viewerUserId) {
          const [{ data: liked }, { data: bookmarked }] = await Promise.all([
            supabase.from('likes').select('id').eq('note_id', note.id).eq('user_id', viewerUserId).maybeSingle(),
            supabase.from('bookmarks').select('id').eq('note_id', note.id).eq('user_id', viewerUserId).maybeSingle(),
          ])
          note.viewer_has_liked = Boolean(liked)
          note.viewer_has_bookmarked = Boolean(bookmarked)
        } else {
          note.viewer_has_liked = false
          note.viewer_has_bookmarked = false
        }

        // Increment view_count — atomic, no race condition
        await supabase.rpc('increment_view_count', { note_id: parseInt(id) })

        return res.status(200).json(note)

    } catch (err) {
        console.error('GET /api/notes/:id error:', err)
        return res.status(500).json({ message: 'Server error.' })
    }
})

// POST /api/notes/:id/like - auth required, toggle
router.post('/:id/like', auth, async (req, res) => {
  return toggleInteraction(req, res, {
    table: 'likes',
    idField: 'liked',
    denormColumn: 'likes_count'
  })
})

// POST /api/notes/:id/bookmark - auth required, toggle
router.post('/:id/bookmark', auth, async (req, res) => {
  return toggleInteraction(req, res, {
    table: 'bookmarks',
    idField: 'bookmarked',
    denormColumn: 'bookmarks_count'
  })
})

// GET /api/notes/:id/download - public, increments download_count
router.get('/:id/download', async (req, res) => {
    const noteId = parseInt(req.params.id)

    try {
        const { data: note, error } = await supabase
            .from('notes')
            .select('id, file_url, download_count, status')
            .eq('id', noteId)
            .eq('status', STATUS.PUBLISHED)
            .single()

        if (error || !note) {
            return res.status(404).json({ message: 'Note not found.' })
        }

        // Increment download count — atomic, no race condition
        await supabase.rpc('increment_download_count', { note_id: noteId })

        return res.status(200).json({ file_url: note.file_url })

    } catch (err) {
        console.error('Download error:', err)
        return res.status(500).json({ message: 'Server error.' })
    }
})

// DELETE /api/notes/:id and owner or admin only
router.delete('/:id', auth, async (req, res) => {
  const noteId = parseInt(req.params.id)

  try {
    const { data: note, error: fetchError } = await supabase
      .from('notes')
      .select('id, user_id, file_url')
      .eq('id', noteId)
      .single()

    if (fetchError || !note) {
      return res.status(404).json({ message: 'Note not found.' })
    }

    if (note.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You can only delete your own notes.' })
    }

    // Delete from database first
    const { error: deleteError } = await supabase
      .from('notes')
      .delete()
      .eq('id', noteId)

    if (deleteError) {
      return res.status(500).json({ message: 'Could not delete note.' })
    }

    // FIX 5 — delete file from Storage after DB row is gone
    if (note.file_url) {
      const filePath = parseStoragePath(note.file_url)
      if (filePath) {
        const { error: storageError } = await supabaseAdmin.storage
          .from('olongnotes')
          .remove([filePath])
        if (storageError) {
          console.error('Storage delete error — file may be orphaned:', storageError)
          console.error('Orphaned path:', filePath)
        }
      } else {
        console.warn('Could not parse storage path from URL — file not deleted:', note.file_url)
      }
    }

    // FIX 13 — activity log with error capture
    const { error: logError } = await supabase
      .from('activity_log')
      .insert({
        user_id: req.user.id,
        target_type: 'note',
        target_id: noteId,
        activity_type: 'note_deleted',
        description: `Note ${noteId} deleted by ${req.user.role === 'admin' ? 'admin' : 'owner'}`,
        created_at: new Date().toISOString()
      })

    if (logError) {
      console.error('Activity log write failed:', logError)
    }

    return res.status(200).json({ message: 'Note deleted successfully.' })

  } catch (err) {
    console.error('Delete error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/notes/:id/report and auth required
router.post('/:id/report', auth, async (req, res) => {
  const noteId = parseInt(req.params.id)
  const reason = req.body?.reason

  if (!reason) {
    return res.status(400).json({ message: 'A reason is required to report a note.' })
  }

  try {
    const { data: report, error } = await supabase
      .from('reports')
      .insert({
        reporter_id: req.user.id,
        target_type: 'note',
        target_id: noteId,
        reason,
        status: STATUS.PENDING,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      console.error('Report insert error:', error)
      return res.status(500).json({ message: 'Could not submit report.' })
    }

    return res.status(201).json({
      message: 'Report submitted. Our team will review it.',
      report_id: report.id
    })

  } catch (err) {
    console.error('Report error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router



