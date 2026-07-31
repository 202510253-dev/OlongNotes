// ===================== SHARED NOTES DATA =====================
// Single source of truth for subject labels + document/notes mock data.
// Both school-profile.js and browse.js read from this file, so every
// page shows the exact same notes. When the backend is ready, replace
// the arrays below with a fetch() call that returns the same shape.

window.OlongNotes = window.OlongNotes || {};

window.OlongNotes.subjectLabels = {
  "mathematics": "Mathematics",
  "science": "Science",
  "english": "English",
  "filipino": "Filipino",
  "araling-panlipunan": "Araling Panlipunan",
  "mapeh": "MAPEH",
  "tle": "TLE",
  "computer-science": "Computer Science",
  "values-education": "Values Education",
};

window.OlongNotes.notes = [
  { id: "n1", subject: "mathematics", topic: "Basic Algebra", caption: "Basic discussion about algebraic expressions and equations.", type: "pdf", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Celine Aire", tint: "#e7833b", rating: 4.8, ratingCount: 120, downloads: "2.3K" },
  { id: "n2", subject: "mathematics", topic: "Geometry Basics", caption: "Overview of angles, shapes, and basic geometric proofs.", type: "docx", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Revie Debo", tint: "#3d6bf0", rating: 4.6, ratingCount: 118, downloads: "1.8K" },
  { id: "n3", subject: "mathematics", topic: "Trigonometry Notes", caption: "Notes on sine, cosine, tangent, and the unit circle.", type: "pdf", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Mark Rivera", tint: "#2e9e5b", rating: 4.7, ratingCount: 130, downloads: "2.1K" },

  { id: "n4", subject: "science", topic: "Cell Structure and Function", caption: "Basic discussion about the parts and functions of a cell.", type: "pdf", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Tope Kalot", tint: "#e0b23c", rating: 4.6, ratingCount: 121, downloads: "1.8K" },
  { id: "n5", subject: "science", topic: "Laws of Motion", caption: "Summary of Newton's three laws with everyday examples.", type: "pdf", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Janice Cruz", tint: "#8b5cf6", rating: 4.8, ratingCount: 121, downloads: "1.8K" },
  { id: "n6", subject: "science", topic: "The Periodic Table", caption: "Guide to element groups, periods, and atomic trends.", type: "docx", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Aire Rose", tint: "#e0556f", rating: 4.5, ratingCount: 112, downloads: "1.5K" },

  { id: "n7", subject: "english", topic: "Parts of Speech Review", caption: "Quick review of nouns, verbs, adjectives, and more.", type: "pdf", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Janice Cruz", tint: "#8b5cf6", rating: 4.6, ratingCount: 110, downloads: "1.6K" },
  { id: "n8", subject: "english", topic: "Essay Writing Guide", caption: "Step-by-step guide to structuring a clear essay.", type: "pdf", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Mark Rivera", tint: "#2e9e5b", rating: 4.7, ratingCount: 108, downloads: "1.4K" },

  { id: "n9", subject: "filipino", topic: "Pagsusuri ng Tula", caption: "Gabay sa pagsusuri ng tema at himig ng tula.", type: "docx", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Celine Aire", tint: "#e7833b", rating: 4.6, ratingCount: 115, downloads: "1.7K" },
  { id: "n10", subject: "filipino", topic: "Balarilang Filipino", caption: "Batayang aralin sa gramatika at pananalitang Filipino.", type: "pdf", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Revie Debo", tint: "#3d6bf0", rating: 4.7, ratingCount: 113, downloads: "1.6K" },

  { id: "n11", subject: "araling-panlipunan", topic: "Kasaysayan ng Pilipinas", caption: "Buod ng mahahalagang pangyayari sa kasaysayan ng bansa.", type: "pdf", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Tope Kalot", tint: "#e0b23c", rating: 4.5, ratingCount: 101, downloads: "1.2K" },
  { id: "n12", subject: "araling-panlipunan", topic: "Mga Sangay ng Pamahalaan", caption: "Paliwanag sa tatlong sangay ng pamahalaan ng Pilipinas.", type: "docx", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Aire Rose", tint: "#e0556f", rating: 4.6, ratingCount: 96, downloads: "1.1K" },

  { id: "n13", subject: "mapeh", topic: "Basic Basketball Rules", caption: "Simple rundown of basketball rules and basic plays.", type: "pdf", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Mark Rivera", tint: "#2e9e5b", rating: 4.4, ratingCount: 88, downloads: "980" },
  { id: "n14", subject: "mapeh", topic: "Elements of Music", caption: "Introduction to rhythm, melody, harmony, and dynamics.", type: "pdf", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Janice Cruz", tint: "#8b5cf6", rating: 4.5, ratingCount: 92, downloads: "1.0K" },

  { id: "n15", subject: "tle", topic: "Basic Cookery Notes", caption: "Essential cooking terms, tools, and safety practices.", type: "docx", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Celine Aire", tint: "#e7833b", rating: 4.6, ratingCount: 99, downloads: "1.1K" },
  { id: "n16", subject: "tle", topic: "Intro to Entrepreneurship", caption: "Basic concepts on starting and managing a small business.", type: "pdf", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Revie Debo", tint: "#3d6bf0", rating: 4.5, ratingCount: 90, downloads: "980" },

  { id: "n17", subject: "computer-science", topic: "Basic Hardware Components", caption: "Basic discussion about computer hardware components.", type: "pdf", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Celine Aire", tint: "#e7833b", rating: 4.8, ratingCount: 120, downloads: "2.3K" },
  { id: "n18", subject: "computer-science", topic: "Intro to Programming", caption: "Beginner-friendly walkthrough of programming fundamentals.", type: "pdf", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Revie Debo", tint: "#3d6bf0", rating: 4.6, ratingCount: 118, downloads: "1.8K" },
  { id: "n19", subject: "computer-science", topic: "Database Systems", caption: "Overview of tables, keys, and basic database design.", type: "docx", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Mark Rivera", tint: "#2e9e5b", rating: 4.6, ratingCount: 115, downloads: "1.7K" },

  { id: "n20", subject: "values-education", topic: "Understanding Empathy", caption: "Notes on recognizing and responding to others' feelings.", type: "pdf", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Aire Rose", tint: "#e0556f", rating: 4.7, ratingCount: 84, downloads: "870" },
  { id: "n21", subject: "values-education", topic: "Building Good Character", caption: "Reflection guide on honesty, respect, and responsibility.", type: "docx", school: "Gordon College", location: "Olongapo City, Philippines", gradeLevel: "College Level", author: "Janice Cruz", tint: "#8b5cf6", rating: 4.5, ratingCount: 79, downloads: "800" },
];