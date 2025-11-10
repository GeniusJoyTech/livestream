const jwt = require("jsonwebtoken");

/**
 * Gera um token JWT com base no usuário.
 * @param {Object} user - Objeto de usuário contendo id e username.
 * @returns {string} Token JWT.
 */
function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );
}

/**
 * Verifica e decodifica um token JWT.
 * @param {string} token - Token JWT a ser verificado.
 * @returns {Object|null} Retorna o payload se válido ou null se inválido.
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = { generateToken, verifyToken };
