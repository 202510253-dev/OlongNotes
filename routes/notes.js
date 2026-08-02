const express = require('express')
const router = express.Router()
const { supabase, supabaseAdmin } = require('../supabase')
const { body, validationResult } = require('express-validator')
const auth = require('../middleware/auth')
const multer = require('multer')
const { v4: uuidv4 } = require('uuid')


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
        status: req.user.role === 'admin' ? 'published' : 'pending',
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
      .eq('status', 'published')
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
            .eq('status', 'published')
            .single()

        if (error || !note) {
            return res.status(404).json({ message: 'Note not found.' })
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
  const noteId = parseInt(req.params.id)
  const userId = req.user.id

  try {
    const { data: existing } = await supabase
      .from('likes')
      .select('id')
      .eq('note_id', noteId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) {
      const { error: deleteError } = await supabase
        .from('likes')
        .delete()
        .eq('note_id', noteId)
        .eq('user_id', userId)

      if (deleteError) {
        console.error('Like delete error:', deleteError)
        return res.status(500).json({ message: 'Could not remove like.' })
      }
    } else {
      const { error: insertError } = await supabase
        .from('likes')
        .insert({ note_id: noteId, user_id: userId, created_at: new Date().toISOString() })

      if (insertError) {
        if (insertError.code !== '23505') {
          console.error('Like insert error:', insertError)
          return res.status(500).json({ message: 'Could not like note.' })
        }
        // 23505 = race condition, another request won — treat as success
      }
    }

    // Read the current count off the denormalized column. The
    // likes_count_trigger on the likes table has already kept this
    // in sync with the insert/delete we just did.
    const { data: noteRow } = await supabase
      .from('notes')
      .select('likes_count')
      .eq('id', noteId)
      .single()

    const likesCount = (noteRow && typeof noteRow.likes_count === 'number')
      ? noteRow.likes_count
      : 0

    return res.status(existing ? 200 : 201).json({
      message: existing ? 'Like removed.' : 'Note liked.',
      liked: !existing,
      likes_count: likesCount
    })

  } catch (err) {
    console.error('Like error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/notes/:id/bookmark - auth required, toggle
router.post('/:id/bookmark', auth, async (req, res) => {
  const noteId = parseInt(req.params.id)
  const userId = req.user.id

  try {
    const { data: existing } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('note_id', noteId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) {
      const { error: deleteError } = await supabase
        .from('bookmarks')
        .delete()
        .eq('note_id', noteId)
        .eq('user_id', userId)

      if (deleteError) {
        console.error('Bookmark delete error:', deleteError)
        return res.status(500).json({ message: 'Could not remove bookmark.' })
      }
    } else {
      const { error: insertError } = await supabase
        .from('bookmarks')
        .insert({ note_id: noteId, user_id: userId, created_at: new Date().toISOString() })

      if (insertError) {
        if (insertError.code !== '23505') {
          console.error('Bookmark insert error:', insertError)
          return res.status(500).json({ message: 'Could not bookmark note.' })
        }
      }
    }

    // Read the current count off the denormalized column. The
    // bookmarks_count_trigger on the bookmarks table has already kept
    // this in sync with the insert/delete we just did.
    const { data: noteRow } = await supabase
      .from('notes')
      .select('bookmarks_count')
      .eq('id', noteId)
      .single()

    const bookmarksCount = (noteRow && typeof noteRow.bookmarks_count === 'number')
      ? noteRow.bookmarks_count
      : 0

    return res.status(existing ? 200 : 201).json({
      message: existing ? 'Bookmark removed.' : 'Note bookmarked.',
      bookmarked: !existing,
      bookmarks_count: bookmarksCount
    })

  } catch (err) {
    console.error('Bookmark error:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/notes/:id/download - public, increments download_count
router.get('/:id/download', async (req, res) => {
    const noteId = parseInt(req.params.id)

    try {
        const { data: note, error } = await supabase
            .from('notes')
            .select('id, file_url, download_count, status')
            .eq('id', noteId)
            .eq('status', 'published')
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
      const urlParts = note.file_url.split('/storage/v1/object/public/olongnotes/')
      const filePath = urlParts[1]
      if (filePath) {
        const { error: storageError } = await supabaseAdmin.storage
          .from('olongnotes')
          .remove([filePath])
        if (storageError) {
          console.error('Storage delete error (file may be orphaned):', storageError)
        }
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
        status: 'pending',
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



