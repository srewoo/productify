/**
 * Productify — routes/health.js
 */

const START_TIME = Date.now();

export function healthRoute(req, res) {
  res.json({
    status: 'ok',
    version: '1.0.0',
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString()
  });
}
