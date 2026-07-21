// adminOnly middleware
// Runs AFTER auth middleware AND never standalone
// Checks req.user.role === 'admin' (STRICTLY)
// Returns 403 if not admin

const adminOnly = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized.' })
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden. Admin access only.' })
    }

    next()
}

module.exports = adminOnly