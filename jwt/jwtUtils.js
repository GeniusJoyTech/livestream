const jwt = require("jsonwebtoken");

/**
 * Gera um token JWT com base no usuário.
 * @param {Object} user - Objeto de usuário contendo id e username.
 * @returns {string} Token JWT.
 */
function generateToken(payload, expiresIn = "2h") {
  const tokenPayload = {
    ...payload,
    aud: 'simplificavideos-api',
    iss: 'simplificavideos-auth',
    iat: Math.floor(Date.now() / 1000)
  };
  
  return jwt.sign(
    tokenPayload,
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

/**
 * Verifica e decodifica um token JWT.
 * @param {string} token - Token JWT a ser verificado.
 * @returns {Object|null} Retorna o payload se válido ou null se inválido.
 */
function verifyToken(token, expectedType = null) {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      audience: 'simplificavideos-api',
      issuer: 'simplificavideos-auth'
    });
    
    if (expectedType && payload.type !== expectedType) {
      console.warn(`Token type mismatch: expected ${expectedType}, got ${payload.type}`);
      return null;
    }
    
    return payload;
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return null;
  }
}

module.exports = { generateToken, verifyToken };
