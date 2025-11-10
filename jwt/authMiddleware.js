const { verifyToken } = require("./jwtUtils");

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token ausente" });

  const user = verifyToken(token);
  if (!user) return res.status(403).json({ error: "Token inválido" });

  req.user = user;
  next();
}

module.exports = { authenticateToken };
