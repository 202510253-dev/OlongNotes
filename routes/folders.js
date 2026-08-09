// ===================== FOLDERS (Phase 6.2) =====================
// Single-resource read for a user's folders.
//
// Surface area (READ only — no POST/DELETE in this cut):
//   GET  /api/folders/:id   (auth)  One folder + all notes in it.
//
// The list of the user's folders (GET /api/users/me/folders) lives in
// routes/users.js alongside the bookmarks read.
//
// These routes use `supabaseAdmin` (service role) + an explicit ownership
// check, mirroring routes/activities.js and routes/users.js. The backend's
// anon `supabase` client carries no JWT, so the RLS policies (auth.uid()
// vs row user_id) never match a backend PostgREST request — the anon
// client would silently return zero rows. With the service-role client RLS
// is bypassed entirely, so the manual ownership check IS the only backstop
// here — it must run BEFORE the notes join. Do NOT leak the service-role
// key to the frontend.

const express = require('express')
const router = express.Router()
const { supabaseAdmin } = require('../supabase')
const auth = require('../middleware/auth')

// ---------- GET /api/folders/:id ----------
//
// Auth required. Returns the folder's details plus every note in it
// (join folder_items -> notes), shaped like the notes list endpoint so the
// frontend reuses the same note markup.
//
// Ownership: the folder must belong to the requesting user. Returns 404
// when the folder doesn't exist and 403 when it belongs to someone else
// (mirrors the single-resource convention in routes/questions.js /
// routes/notes.js). The ownership check happens before the notes join.
//
// Returns { folder: {...}, notes: [...] }.
router.get('/:id', auth, async (req, res) => {
  const folderId = parseInt(req.params.id)
  if (!folderId || Number.isNaN(folderId) || folderId <= 0) {
    return res.status(400).json({ message: 'Invalid folder id.' })
  }

  try {
    // Step 1 — fetch the folder. Service role, so scope manually by
    // user_id. We need user_id to enforce ownership before returning
    // anything about the folder's contents.
    const { data: folder, error: folderError } = await supabaseAdmin
      .from('folders')
      .select('id, folder_name, user_id, created_at')
      .eq('id', folderId)
      .maybeSingle()

    if (folderError) {
      console.error('[folders] GET /:id fetch error:', folderError)
      return res.status(500).json({ message: 'Could not fetch folder.' })
    }
    // Not found vs not yours: mirror the existing convention — 404 when
    // the row doesn't exist, 403 when it belongs to someone else. This
    // check runs before any notes join.
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found.' })
    }
    if (folder.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "You can only access your own folders." })
    }

    // Step 2 — fetch the notes in this folder via folder_items. The user
    // owns the folder (checked above), so we can read all of its items.
    const { data: items, error: itemsError } = await supabaseAdmin
      .from('folder_items')
      .select(`
        id,
        created_at,
        notes (
          id,
          title,
          annotation,
          file_url,
          file_type,
          file_size,
          grade_level,
          group_id,
          download_count,
          view_count,
          likes_count,
          bookmarks_count,
          created_at,
          status,
          users ( user_name ),
          schools ( school_name ),
          subjects ( subject_name )
        )
      `)
      .eq('folder_id', folderId)
      .order('created_at', { ascending: false })

    if (itemsError) {
      console.error('[folders] GET /:id items error:', itemsError)
      return res.status(500).json({ message: 'Could not fetch folder notes.' })
    }

    // Flatten the embed so each note carries the note fields directly
    // (with the note's joined users/schools/subjects intact). The spread
    // of item.notes keeps the note's real id intact. The folder_items
    // table uses `created_at` (not `added_at`) to timestamp when a note
    // was added to the folder — we surface it as `added_at` for the
    // frontend's mental model.
    const notes = (items || []).map((item) => ({
      ...(item.notes || {}),
      added_at: item.created_at,
    }))

    return res.status(200).json({
      folder: {
        id: folder.id,
        folder_name: folder.folder_name,
        created_at: folder.created_at,
      },
      notes,
    })
  } catch (err) {
    console.error('[folders] GET /:id exception:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
