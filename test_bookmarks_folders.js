// Phase 6.2 — manual end-to-end test of the three READ endpoints.
// Creates a throwaway user + seeds bookmarks/folders/folder_items via the
// service-role client, then hits the real HTTP endpoints with a real token.
//
// Usage: node test_bookmarks_folders.js
process.env.NODE_NO_WARNINGS = '1'
require('dotenv').config()

const { supabase, supabaseAdmin } = require('./supabase')

const BASE = `http://localhost:${process.env.PORT || 3000}`
const EMAIL = `p62test_${Date.now()}@test.local`
const PASS = 'testpass1234'

let pass = 0
let fail = 0
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name} ${extra ? JSON.stringify(extra) : ''}`) }
}

async function api(method, path, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
  })
  let body = null
  try { body = await res.json() } catch { /* non-JSON */ }
  return { status: res.status, body }
}

async function main() {
  console.log('=== SETUP ===')

  // 1. Create auth user
  const { data: authData, error: signupErr } = await supabase.auth.signUp({ email: EMAIL, password: PASS })
  if (signupErr || !authData?.user) { console.error('signup failed', signupErr); process.exit(1) }
  const authId = authData.user.id

  // 2. Create public.users row
  const { data: profile, error: profErr } = await supabaseAdmin
    .from('users')
    .insert({ auth_id: authId, user_name: `p62test_${Date.now()}`, email: EMAIL, role: 'viewer', account_status: 'active', created_at: new Date().toISOString() })
    .select('id')
    .single()
  if (profErr) { console.error('profile insert failed', profErr); process.exit(1) }
  const userId = profile.id

  // 3. Find a published note to reference
  const { data: notes } = await supabaseAdmin.from('notes').select('id').eq('status', 'published').limit(3)
  const noteIds = (notes || []).map((n) => n.id)
  if (noteIds.length === 0) { console.error('No published notes found to reference'); process.exit(1) }

  // 4. Seed bookmarks + folders + folder_items
  await supabaseAdmin.from('bookmarks').insert({ user_id: userId, note_id: noteIds[0], created_at: new Date().toISOString() })
  await supabaseAdmin.from('bookmarks').insert({ user_id: userId, note_id: noteIds[1], created_at: new Date().toISOString() })
  const { data: folderA } = await supabaseAdmin.from('folders').insert({ user_id: userId, folder_name: 'Math', created_at: new Date().toISOString() }).select('id').single()
  const { data: folderB } = await supabaseAdmin.from('folders').insert({ user_id: userId, folder_name: 'Empty', created_at: new Date().toISOString() }).select('id').single()
// folderA gets 2 notes, folderB gets 0. NOTE: the actual folder_items
  // schema uses created_at (not added_at) — verified live 2026-08-09.
  await supabaseAdmin.from('folder_items').insert({ folder_id: folderA.id, note_id: noteIds[0], created_at: new Date().toISOString() })
  await supabaseAdmin.from('folder_items').insert({ folder_id: folderA.id, note_id: noteIds[1], created_at: new Date().toISOString() })

  // 5. Login for a real token
  const { data: login } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASS })
  const token = login?.session?.access_token
  if (!token) { console.error('login failed'); process.exit(1) }

  console.log('  user_id =', userId, ' auth_id =', authId)
  console.log('  note ids =', noteIds.join(','))
  console.log('  folderA =', folderA.id, ' folderB =', folderB.id)

  console.log('=== GET /api/users/me/bookmarks ===')
  const bm = await api('GET', '/api/users/me/bookmarks', token)
  check('returns 200', bm.status === 200, bm.body)
  check('returns 2 bookmarks', Array.isArray(bm.body?.bookmarks) && bm.body.bookmarks.length === 2, bm.body)
  if (bm.body?.bookmarks?.[0]) {
    const b = bm.body.bookmarks[0]
    check('bookmark has note title', typeof b.title === 'string', b)
    check('bookmark has subject embed', b.subjects && 'subject_name' in b.subjects, b)
    check('bookmark has bookmarked_at', 'bookmarked_at' in b, b)
    check('bookmark has note id', b.id != null, b)
  }

  console.log('=== GET /api/users/me/folders ===')
  const fl = await api('GET', '/api/users/me/folders', token)
  check('returns 200', fl.status === 200, fl.body)
  const flArr = fl.body?.folders || []
  check('returns 2 folders', Array.isArray(flArr) && flArr.length === 2, fl.body)
  const fA = flArr.find((f) => f.id === folderA.id)
  const fB = flArr.find((f) => f.id === folderB.id)
  check('folderA note_count = 2', fA && fA.note_count === 2, fA)
  check('folderB note_count = 0', fB && fB.note_count === 0, fB)
  check('folder has folder_name', fA && typeof fA.folder_name === 'string', fA)

  console.log('=== GET /api/folders/:id (own) ===')
  const own = await api('GET', `/api/folders/${folderA.id}`, token)
  check('returns 200', own.status === 200, own.body)
  check('folder name correct', own.body?.folder?.folder_name === 'Math', own.body)
  check('returns 2 notes', Array.isArray(own.body?.notes) && own.body.notes.length === 2, own.body)
  if (own.body?.notes?.[0]) {
    const n = own.body.notes[0]
    check('note has title', typeof n.title === 'string', n)
    check('note has added_at', 'added_at' in n, n)
    check('note has subjects embed', n.subjects && 'subject_name' in n.subjects, n)
  }

  console.log('=== GET /api/folders/:id (not yours / fake) ===')
  const nf = await api('GET', `/api/folders/${999999999}`, token)
  check('fake id -> 404', nf.status === 404, nf.body)

  // Create a folder owned by a DIFFERENT user
  const { data: otherAuth } = await supabase.auth.signUp({ email: `other_${Date.now()}@test.local`, password: PASS })
  const { data: otherProf } = await supabaseAdmin.from('users').insert({ auth_id: otherAuth.user.id, user_name: `other_${Date.now()}`, email: `other_${Date.now()}@test.local`, role: 'viewer', account_status: 'active', created_at: new Date().toISOString() }).select('id').single()
  const { data: otherFolder } = await supabaseAdmin.from('folders').insert({ user_id: otherProf.id, folder_name: 'Others', created_at: new Date().toISOString() }).select('id').single()
  const cross = await api('GET', `/api/folders/${otherFolder.id}`, token)
  check('someone else folder -> 403', cross.status === 403, cross.body)

  console.log('=== NO / INVALID TOKEN ===')
  const nb = await api('GET', '/api/users/me/bookmarks', null)
  check('bookmarks no token -> 401', nb.status === 401, nb.body)
  const nfo = await api('GET', '/api/users/me/folders', null)
  check('folders no token -> 401', nfo.status === 401, nfo.body)
  const nfid = await api('GET', `/api/folders/${folderA.id}`, null)
  check('folder no token -> 401', nfid.status === 401, nfid.body)
  const ib = await api('GET', '/api/users/me/bookmarks', 'bogus.token.here')
  check('bookmarks invalid token -> 401', ib.status === 401, ib.body)

  console.log('=== CLEANUP ===')
  await supabaseAdmin.from('folder_items').delete().eq('folder_id', folderA.id)
  await supabaseAdmin.from('folder_items').delete().eq('folder_id', folderB.id)
  await supabaseAdmin.from('folders').delete().in('id', [folderA.id, folderB.id, otherFolder.id])
  await supabaseAdmin.from('bookmarks').delete().eq('user_id', userId)
  await supabaseAdmin.from('users').delete().in('id', [userId, otherProf.id])
  await supabase.auth.signInWithPassword({ email: otherAuth.user.email, password: PASS }).then(() => supabase.auth.signOut()).catch(() => {})
  console.log('  cleaned up')

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

// Start the server in-process? No — we assume it's already running on BASE.
main().catch((e) => { console.error('TEST CRASH', e); process.exit(1) })
