const express = require('express')
const router = express.Router()
const { supabase } = require('../supabase')
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
router.post('/', auth, upload.single('file'), async (req, res) => {

    // Check role - only limited or verified can upload
    if (!['limited', 'verified', 'admin'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Only contributors can upload notes.' })
    }

    // Check file exists
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' })
    }

    const { title, subject_id, school_id, grade_level, annotation } = req.body

    // Validate required fields
    if (!title || !subject_id || !grade_level) {
        return res.status(400).json({ message: 'Title, subject, and grade level are required.' })
    }

    try {
        // Generate safe unique filename
        const fileExt = req.file.originalname.split('.').pop()
        const fileName = `${uuidv4()}.${fileExt}`
        const filePath = `notes/${fileName}`

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
            return res.status(500).json({ message: 'Could not save note. Please try again.' })
        }

        return res.status(201).json({
            message: 'Note uploaded successfully. It will appear after admin review.',
            note
        })

    } catch (err) {
        console.error('Upload error:', err)
        return res.status(500).json({ message: 'Server error. Please try again.' })
    }
})

// GET /api/notes - public, no auth required
router.get('/', async (req, res) => {
    const { school, grade_level, subject, file_type } = req.query

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
        created_at,
        status,
        users ( user_name ),
        schools ( school_name ),
        subjects ( subject_name )
      `)
            .eq('status', 'published')
            .order('created_at', { ascending: false })

        // Apply filters only if provided
        if (school) query = query.eq('school_id', parseInt(school))
        if (grade_level) query = query.eq('grade_level', grade_level)
        if (subject) query = query.eq('subject_id', parseInt(subject))
        if (file_type) query = query.eq('file_type', file_type)

        const { data: notes, error } = await query

        if (error) {
            console.error('Fetch notes error:', error)
            return res.status(500).json({ message: 'Could not fetch notes.' })
        }

        return res.status(200).json(notes)

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

        // Increment view_count
        await supabase
            .from('notes')
            .update({ view_count: note.view_count + 1 })
            .eq('id', parseInt(id))

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
        // Check if like already exists
        const { data: existing } = await supabase
            .from('likes')
            .select('id')
            .eq('note_id', noteId)
            .eq('user_id', userId)
            .single()

        if (existing) {
            // Already liked - remove it (toggle off)
            await supabase
                .from('likes')
                .delete()
                .eq('note_id', noteId)
                .eq('user_id', userId)

            return res.status(200).json({ message: 'Like removed.', liked: false })
        } else {
            // Not liked yet — add it (toggle on)
            await supabase
                .from('likes')
                .insert({ note_id: noteId, user_id: userId, created_at: new Date().toISOString() })

            return res.status(201).json({ message: 'Note liked.', liked: true })
        }

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
            .single()

        if (existing) {
            await supabase
                .from('bookmarks')
                .delete()
                .eq('note_id', noteId)
                .eq('user_id', userId)

            return res.status(200).json({ message: 'Bookmark removed.', bookmarked: false })
        } else {
            await supabase
                .from('bookmarks')
                .insert({ note_id: noteId, user_id: userId, created_at: new Date().toISOString() })

            return res.status(201).json({ message: 'Note bookmarked.', bookmarked: true })
        }

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

        // Increment download count
        await supabase
            .from('notes')
            .update({ download_count: note.download_count + 1 })
            .eq('id', noteId)

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
        // Fetch the note first to check ownership
        const { data: note, error: fetchError } = await supabase
            .from('notes')
            .select('id, user_id, file_url')
            .eq('id', noteId)
            .single()

        if (fetchError || !note) {
            return res.status(404).json({ message: 'Note not found.' })
        }

        // Only owner or admin can delete
        if (note.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'You can only delete your own notes.' })
        }

        // Delete from database
        const { error: deleteError } = await supabase
            .from('notes')
            .delete()
            .eq('id', noteId)

        if (deleteError) {
            return res.status(500).json({ message: 'Could not delete note.' })
        }

        // Log to activity_log
        await supabase
            .from('activity_log')
            .insert({
                user_id: req.user.id,
                note_id: noteId,
                activity_type: 'note_deleted',
                description: `Note ${noteId} deleted by ${req.user.role === 'admin' ? 'admin' : 'owner'}`,
                created_at: new Date().toISOString()
            })

        return res.status(200).json({ message: 'Note deleted successfully.' })

    } catch (err) {
        console.error('Delete error:', err)
        return res.status(500).json({ message: 'Server error.' })
    }
})

// POST /api/notes/:id/report and auth required
router.post('/:id/report', auth, async (req, res) => {
    const noteId = parseInt(req.params.id)

    // Guard  missing body
    const reason = req.body?.reason

    if (!reason) {
        return res.status(400).json({ message: 'A reason is required to report a note.' })
    }

    try {
        const { error } = await supabase
            .from('reports')
            .insert({
                reporter_id: req.user.id,
                target_type: 'note',
                target_id: noteId,
                reason,
                status: 'pending',
                created_at: new Date().toISOString()
            })

        if (error) {
            console.error('Report error:', error)
            return res.status(500).json({ message: 'Could not submit report.' })
        }

        return res.status(201).json({ message: 'Report submitted. Our team will review it.' })

    } catch (err) {
        console.error('Report error:', err)
        return res.status(500).json({ message: 'Server error.' })
    }
})
// GET /api/notes
// GET /api/notes/:id
// POST /api/notes
// DELETE /api/notes/:id

module.exports = router



