const jwt = require('jsonwebtoken');

// Checks the "Authorization: Bearer <token>" header and sets req.user = { id, username }.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Липсва или е невалиден токен за достъп.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // JWT "sub" is always a string per spec — convert it to a number here so it
    // matches the INTEGER user_id from the database in (===/!==) comparisons in routes.
    req.user = { id: Number(payload.sub), username: payload.username };
    next();
  } catch {
    return res.status(401).json({ error: 'Токенът е невалиден или е изтекъл.' });
  }
}

module.exports = { requireAuth };
