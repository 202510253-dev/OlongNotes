// ===================== FOLDERS (Phase 6.2) =====================
// A user's folders (what the profile page labels "My Collection").
//
// Surface area:
//   POST   /api/folders         (auth)  Create a folder.
//   GET    /api/folders/:id     (auth)  One folder + all notes in it.
//   DELETE /api/folders/:id     (auth)  Delete a folder (+ its items).
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

// ---------- POST /api/folders ----------
//
// Auth required. Creates a folder for the signed-in user so the profile
// page's "My Collection" can be built from real rows instead of static
// markup. Returns the created folder.
//
// Body: { folder_name }  (required, trimmed, 1-60 chars)
//
// Returns 201 { folder: { id, folder_name, user_id, created_at } }.
// Folder names are not unique — the UI owns any duplicate-name UX.
router.post('/', auth, async (req, res) => {
  const folderName = String((req.body && req.body.folder_name) || '').trim()

  if (!folderName) {
    return res.status(400).json({ message: 'Collection name is required.' })
  }
  if (folderName.length > 60) {
    return res.status(400).json({ message: 'Collection name must be 60 characters or fewer.' })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('folders')
      .insert({
        folder_name: folderName,
        user_id: req.user.id,
        created_at: new Date().toISOString(),
      })
      .select('id, folder_name, user_id, created_at')
      .single()

    if (error) {
      console.error('[folders] POST create error:', error)
      return res.status(500).json({ message: 'Could not create collection.' })
    }

    return res.status(201).json({ folder: data })
  } catch (err) {
    console.error('[folders] POST exception:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

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

// ---------- POST /api/folders/:id/items ----------
//
// Auth required. Adds a note to a folder (inserts a folder_items row).
// Body: { note_id } (required, must exist).
//
// Idempotent: if the note is already in the folder, returns 200 with the
// existing item instead of duplicating. Ownership mirrors GET /:id.
//
// Returns 201 { item: { id, folder_id, note_id } }.
router.post('/:id/items', auth, async (req, res) => {
  const folderId = parseInt(req.params.id)
  const noteId = parseInt(req.body && req.body.note_id)
  if (!folderId || Number.isNaN(folderId) || folderId <= 0) {
    return res.status(400).json({ message: 'Invalid folder id.' })
  }
  if (!noteId || Number.isNaN(noteId) || noteId <= 0) {
    return res.status(400).json({ message: 'Invalid note id.' })
  }

  try {
    // Ownership check first (see GET /:id comment — RLS is bypassed).
    const { data: folder, error: folderError } = await supabaseAdmin
      .from('folders')
      .select('id, user_id')
      .eq('id', folderId)
      .maybeSingle()

    if (folderError) {
      console.error('[folders] POST /:id/items fetch error:', folderError)
      return res.status(500).json({ message: 'Could not add note to collection.' })
    }
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found.' })
    }
    if (folder.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "You can only manage your own folders." })
    }

    // Make sure the note actually exists (so we never insert a dangling
    // folder_item reference).
    const { data: note, error: noteError } = await supabaseAdmin
      .from('notes')
      .select('id')
      .eq('id', noteId)
      .maybeSingle()
    if (noteError) {
      console.error('[folders] POST /:id/items note check error:', noteError)
      return res.status(500).json({ message: 'Could not add note to collection.' })
    }
    if (!note) {
      return res.status(404).json({ message: 'Note not found.' })
    }

    // Idempotency: if an item already links folder+note, ship it back as the
    // "created" result so the UI never shows duplicate rows.
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('folder_items')
      .select('id, folder_id, note_id')
      .eq('folder_id', folderId)
      .eq('note_id', noteId)
      .maybeSingle()
    if (existingError) {
      console.error('[folders] POST /:id/items dup check error:', existingError)
      return res.status(500).json({ message: 'Could not add note to collection.' })
    }
    if (existing) {
      return res.status(200).json({ item: existing, already: true })
    }

    const { data: item, error: insertError } = await supabaseAdmin
      .from('folder_items')
      .insert({
        folder_id: folderId,
        note_id: noteId,
        created_at: new Date().toISOString(),
      })
      .select('id, folder_id, note_id')
      .single()

    if (insertError) {
      console.error('[folders] POST /:id/items insert error:', insertError)
      return res.status(500).json({ message: 'Could not add note to collection.' })
    }

    return res.status(201).json({ item })
  } catch (err) {
    console.error('[folders] POST /:id/items exception:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// ---------- DELETE /api/folders/:id/items/:noteId ----------
//
// Auth required. Removes a specific note from a folder (deletes the
// matching folder_items row). Ownership mirrors GET /:id. The note itself
// is never touched.
//
// Returns { ok: true, item: { id } } or 404 if no such link exists.
router.delete('/:id/items/:noteId', auth, async (req, res) => {
  const folderId = parseInt(req.params.id)
  const noteId = parseInt(req.params.noteId)
  if (!folderId || Number.isNaN(folderId) || folderId <= 0) {
    return res.status(400).json({ message: 'Invalid folder id.' })
  }
  if (!noteId || Number.isNaN(noteId) || noteId <= 0) {
    return res.status(400).json({ message: 'Invalid note id.' })
  }

  try {
    const { data: folder, error: folderError } = await supabaseAdmin
      .from('folders')
      .select('id, user_id')
      .eq('id', folderId)
      .maybeSingle()

    if (folderError) {
      console.error('[folders] DELETE /:id/items/:noteId fetch error:', folderError)
      return res.status(500).json({ message: 'Could not remove note from collection.' })
    }
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found.' })
    }
    if (folder.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "You can only manage your own folders." })
    }

    const { data: item, error: itemError } = await supabaseAdmin
      .from('folder_items')
      .select('id')
      .eq('folder_id', folderId)
      .eq('note_id', noteId)
      .maybeSingle()

    if (itemError) {
      console.error('[folders] DELETE /:id/items/:noteId item fetch error:', itemError)
      return res.status(500).json({ message: 'Could not remove note from collection.' })
    }
    if (!item) {
      return res.status(404).json({ message: 'This note is not in this collection.' })
    }

    const { error: deleteError } = await supabaseAdmin
      .from('folder_items')
      .delete()
      .eq('id', item.id)

    if (deleteError) {
      console.error('[folders] DELETE /:id/items/:noteId delete error:', deleteError)
      return res.status(500).json({ message: 'Could not remove note from collection.' })
    }

    return res.status(200).json({ ok: true, item: { id: item.id } })
  } catch (err) {
    console.error('[folders] DELETE /:id/items/:noteId exception:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

// ---------- DELETE /api/folders/:id ----------
//
// Auth required. Deletes a folder AND everything inside it (folder_items
// are removed first — the delete is ordered so we never orphan items
// that reference a removed folder). Ownership mirrors GET /:id: 404 when
// the folder doesn't exist, 403 when it belongs to someone else.
//
// Returns { ok: true, folder: { id } }.
router.delete('/:id', auth, async (req, res) => {
  const folderId = parseInt(req.params.id)
  if (!folderId || Number.isNaN(folderId) || folderId <= 0) {
    return res.status(400).json({ message: 'Invalid folder id.' })
  }

  try {
    const { data: folder, error: folderError } = await supabaseAdmin
      .from('folders')
      .select('id, user_id')
      .eq('id', folderId)
      .maybeSingle()

    if (folderError) {
      console.error('[folders] DELETE ownership fetch error:', folderError)
      return res.status(500).json({ message: 'Could not delete collection.' })
    }
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found.' })
    }
    if (folder.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "You can only manage your own folders." })
    }

    // Remove the folder's items first, then the folder itself. Either
    // delete is best-effort against schema drift, but the folder remove
    // is the one the caller cares about.
    const { error: itemsError } = await supabaseAdmin
      .from('folder_items')
      .delete()
      .eq('folder_id', folderId)

    if (itemsError) {
      console.error('[folders] DELETE items error:', itemsError)
    }

    const { error: deleteError } = await supabaseAdmin
      .from('folders')
      .delete()
      .eq('id', folderId)

    if (deleteError) {
      console.error('[folders] DELETE folder error:', deleteError)
      return res.status(500).json({ message: 'Could not delete collection.' })
    }

    return res.status(200).json({ ok: true, folder: { id: folderId } })
  } catch (err) {
    console.error('[folders] DELETE exception:', err)
    return res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
