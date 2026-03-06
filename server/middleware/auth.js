/**
 * Productify — middleware/auth.js
 * Validates that required headers are present for API routes.
 * Does NOT validate key correctness (OpenAI will reject if wrong).
 */

const PUBLIC_ROUTES = ['/health', '/intents'];

export function authMiddleware(req, res, next) {
  if (PUBLIC_ROUTES.includes(req.path) || req.method === 'OPTIONS') {
    return next();
  }
  // For library routes (local-only demo), allow without key
  if (req.path.startsWith('/library')) {
    return next();
  }
  // Require OpenAI key for processing routes
  const openaiKey = req.headers['x-openai-key'] || process.env.DEMO_OPENAI_KEY;
  if (!openaiKey) {
    return res.status(401).json({
      error: 'OpenAI API key required. Add it in Productify Settings.',
      code: 'MISSING_API_KEY'
    });
  }
  next();
}
