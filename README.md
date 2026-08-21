# OlongNotes

A community-driven notes and Q&A platform for the students of **Olongapo City** — built so learners from kindergarten through college can share, discover, and discuss study material in one place.

> *For students. By students.*

---

## What is OlongNotes?

OlongNotes is a full-stack web application where students can:

- 📚 **Upload & browse notes** — organized by school, subject, and education level (K–10, SHS, College)
- ❓ **Ask questions & post answers** — community Q&A with accept-answer, similar-question suggestions, and reporting
- 🏫 **Discover schools** — browse schools by category (Colleges, Private, Public)
- 📊 **Track activity** — a live recent-activities feed for uploads, Q&A, likes, and bookmarks
- 👤 **Build a profile** — bio, avatar, contributions, points, and activity history
- 🔐 **Admin tools** — user management, content moderation, and reporting review

The design uses a navy (`#0F2A52`) + goldenrod (`#D4A24C`) palette with a fully responsive, dark-mode-ready interface.

---

## Tech Stack

**Backend**
- Node.js + Express 5
- Supabase (PostgreSQL via `@supabase/supabase-js`)
- `express-validator` for input validation
- `helmet` for security headers
- `cors` for cross-origin support
- `multer` for file uploads
- `bcrypt` + session-based auth
- Vercel serverless deployment (`@vercel/speed-insights`)

**Frontend**
- Vanilla JavaScript (no framework)
- Semantic HTML5
- Modern CSS (custom properties, grid, flexbox, dark mode)
- Fully responsive (mobile bottom-sheet modals, desktop side panels)
- Accessible (ARIA, keyboard nav, `prefers-reduced-motion`)

---

## Project Structure

```
olongnotes/
├── server.js              # Express app entry point
├── supabase.js            # Supabase client setup
├── vercel.json            # Vercel deployment config
├── package.json
├── middleware/
│   ├── auth.js            # Session auth middleware
│   └── adminOnly.js       # Admin role guard
├── routes/
│   ├── auth.js            # Register, login, logout, session
│   ├── users.js           # Profile, avatars, user data
│   ├── notes.js           # Upload, browse, like, bookmark
│   ├── questions.js       # Ask, answer, accept
│   ├── answers.js         # Answer CRUD
│   ├── activities.js      # Recent-activities feed
│   ├── catalog.js         # Featured & tiered notes catalog
│   ├── folders.js         # User folders/collections
│   └── admin.js           # Admin moderation endpoints
└── public/
    ├── index.html         # Landing page
    ├── community.html     # Browse notes (filters/sort/pagination)
    ├── question.html      # Q&A feed
    ├── answer.html        # Single question detail
    ├── notes.html         # Featured notes gallery
    ├── schools.html       # Schools directory
    ├── school-profile.html
    ├── subjects.html
    ├── subject-notes.html
    ├── profile.html       # User profile
    ├── admin.html         # Admin dashboard
    ├── contributors.html
    ├── recent-activities.html
    ├── document-viewer.html
    ├── about.html
    ├── css/               # Per-page stylesheets
    ├── js/                # Per-page scripts + shared modules
    └── img/               # Static images
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works) — get your URL + service-role key from the Supabase dashboard

### Installation

```bash
# Clone the repo
git clone https://github.com/your-username/olongnotes.git
cd olongnotes

# Install dependencies
npm install

# Create a .env file
cp .env.example .env
# then fill in your Supabase credentials
```

### Environment Variables

Create a `.env` file in the project root:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SESSION_SECRET=any-long-random-string
```

### Run Locally

```bash
npm run dev          # nodemon with auto-restart
# or
npm start            # plain node
```

The app will start on `http://localhost:3000`.

---

## Database

The project uses Supabase (PostgreSQL) with the following tables:

| Table | Purpose |
|---|---|
| `users` | Accounts, profiles, avatars, role (`student`/`contributor`/`admin`) |
| `schools` | Schools with category, logo, and metadata |
| `subjects` | Subjects scoped by education level |
| `notes` | Uploaded study materials (file metadata, subject/school FKs, likes, downloads) |
| `activity_log` | Recent-activities feed (uploads, Q&A, likes, bookmarks) |
| `reports` | User reports for moderation (with status CHECK constraint) |

Row-Level Security policies and FK `ON DELETE CASCADE` keep referential integrity intact.

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `/api/auth/*` | Register, login, logout, session check |
| `/api/users/*` | Profile reads/updates, avatar upload |
| `/api/notes/*` | Upload, browse, like, bookmark, featured |
| `/api/questions/*` | Ask, list, detail, accept answer |
| `/api/answers/*` | Post answer, edit, delete, report |
| `/api/activities` | Recent-activities feed |
| `/api/catalog/*` | Tiered catalog (K–10 / SHS / College) |
| `/api/folders/*` | User folders/collections |
| `/api/admin/*` | Admin-only moderation |

---

## Deployment

This project is configured for **Vercel**:

```bash
npm i -g vercel
vercel
```

The `vercel.json` routes all requests through `server.js` using `@vercel/node`.

---

## Design System

- **Primary navy:** `#0F2A52`
- **Accent goldenrod:** `#D4A24C`
- **Accent blue:** `#2F6FED`
- **Typography:** System sans-serif stack
- **Theme tokens:** All colors defined as CSS custom properties — light + dark variants
- **Motion:** 0.2s ease transitions, respects `prefers-reduced-motion`

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## License

ISC

---

## Credits

Built with care for the students of Olongapo City. 🌆
