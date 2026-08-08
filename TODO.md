# TODO — Featured Notes: Grouped Multi-Image Cards + Caching Fix

## Steps

- [x] 1. Add `group_id` to `GET /api/notes` select in routes/notes.js
- [x] 2. Add `adaptNoteFromApi()` with group_id/fileType in script.js
- [x] 3. Group multi-image notes in featured feed (script.js)
- [x] 4. Add `.featured-card__gallery` badge CSS (style.css)
- [x] 5. Add dedicated `GET /api/featured` endpoint (catalog.js) that groups by group_id + sets no-cache headers
- [x] 6. Update `fetchFeaturedNotes()` in script.js to call `/featured?t=<timestamp>` (cache-buster)
- [x] 7. Verify node --check on catalog.js + script.js + notes.js
