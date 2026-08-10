const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
require('dotenv').config()

const app = express()

// Global error handler — catches multer errors and anything else unhandled.
// The notes uploader (routes/notes.js) and the profile image uploader
// (routes/users.js) share this handler, so profile-specific errors are
// tagged with `req._profileUpload = true` at the route and branched on
// first — otherwise every multer error inherits the notes-specific
// wording (10MB / "PDF, Word, Excel, JPG, PNG") which is misleading for
// avatar/banner uploads that are 5MB and jpeg/png/webp only.
app.use((err, req, res, next) => {
  // Profile avatar/banner upload errors (5MB, jpeg/png/webp only).
  if (req && req._profileUpload) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large. Maximum size is 5MB.' })
    }
    if (err.message === 'File type not allowed') {
      return res.status(400).json({ message: 'File type not allowed. Accepted: JPG, PNG, WebP.' })
    }
  }
  // Multer file size error (notes uploader)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'File too large. Maximum size is 10MB.' })
  }
  // Multer file type error (thrown by fileFilter — notes uploader)
  if (err.message === 'File type not allowed') {
    return res.status(400).json({ message: 'File type not allowed. Accepted: PDF, Word, Excel, JPG, PNG.' })
  }
  // Everything else
  console.error('Unhandled error:', err)
  return res.status(500).json({ message: 'Server error. Please try again.' })
})
// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
defaultSrc: ["'self'"],
imgSrc: [
        "'self'",
        "data:",
        "https://eqllumjkfkwgikauklth.supabase.co",
        "https://*.supabase.co",
        "https://images.unsplash.com",
        "https://*.unsplash.com"
      ],
      // frameSrc must include docs.google.com so the Word/Office preview
      // (Google Docs Viewer) can be embedded in <iframe>. Kept to the
      // minimal set of embeddable origins.
      frameSrc: [
        "'self'",
        "https://eqllumjkfkwgikauklth.supabase.co",
        "https://*.supabase.co",
        "https://docs.google.com"
      ],
    },
  },
}))
app.use(cors({
    origin: 'http://localhost:3000'
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Serve frontend files
app.use(express.static('public'))

// Routes
const authRoutes = require('./routes/auth')
const notesRoutes = require('./routes/notes')
const activitiesRoutes = require('./routes/activities')
const catalogRoutes = require('./routes/catalog')
const questionsRoutes = require('./routes/questions')
const answersRoutes = require('./routes/answers')
const usersRoutes = require('./routes/users')
const adminRoutes = require('./routes/admin')
const foldersRoutes = require('./routes/folders')

app.use('/api/auth', authRoutes)
app.use('/api/notes', notesRoutes)
app.use('/api/activities', activitiesRoutes)
app.use('/api', catalogRoutes)
app.use('/api/questions', questionsRoutes)
app.use('/api/answers', answersRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/folders', foldersRoutes)
app.use('/api/admin', adminRoutes)

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', project: 'OlongNotes' })
})

// Start server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`OlongNotes running on http://localhost:${PORT}`)
})

