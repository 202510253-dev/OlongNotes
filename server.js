const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
require('dotenv').config()

const app = express()

// Security middleware
app.use(helmet())
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
const questionsRoutes = require('./routes/questions')
const usersRoutes = require('./routes/users')
const adminRoutes = require('./routes/admin')

app.use('/api/auth', authRoutes)
app.use('/api/notes', notesRoutes)
app.use('/api/questions', questionsRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/admin', adminRoutes)

// Health check — confirms server is running
app.get('/health', (req, res) => {
    res.json({ status: 'ok', project: 'OlongNotes' })
})

// Start server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`OlongNotes running on http://localhost:${PORT}`)
})