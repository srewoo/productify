/**
 * Productify — middleware/errorHandler.js
 * Global error handler — maps errors to friendly API responses.
 */

export function errorHandler(err, req, res, next) {
  console.error('[Productify Error]', err.message);

  // Handle known error types
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS policy violation.' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Audio file too large. Max 25MB.' });
  }
  if (err.status === 429 || err.message?.includes('rate limit')) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment.' });
  }
  if (err.status === 401 || err.message?.includes('Invalid API key')) {
    return res.status(401).json({ error: 'Invalid API key. Check your Settings.', code: 'INVALID_KEY' });
  }

  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal server error. Please try again.' : err.message,
    code: err.code || 'SERVER_ERROR'
  });
}
