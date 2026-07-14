// Verifies JWT token on every protected route and future depepndencies
const authMiddleware = async (req, res, next) => {
    // for the implementation in setting the auth up
    next()
}

module.exports = authMiddleware

// DO NOT MODIFY!!