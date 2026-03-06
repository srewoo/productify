/**
 * Productify — routes/library.js
 * In-memory prompt library for demo; swap with a database for production.
 */

import { Router } from 'express';

const router = Router();

// In-memory store (per-server-restart) — production: use SQLite/Postgres
const store = new Map();

router.get('/', (req, res) => {
  const items = Array.from(store.values()).sort((a, b) => b.timestamp - a.timestamp);
  res.json({ items });
});

router.post('/', (req, res) => {
  const { title, output, transcript, intent, tags = [] } = req.body;
  if (!output) return res.status(400).json({ error: 'Output required.' });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const item = { id, title: title || transcript?.slice(0, 60) || 'Untitled', output, transcript, intent, tags, timestamp: Date.now(), starred: true };
  store.set(id, item);
  res.status(201).json(item);
});

router.put('/:id', (req, res) => {
  const item = store.get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  const updated = { ...item, ...req.body, id: item.id };
  store.set(item.id, updated);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  if (!store.has(req.params.id)) return res.status(404).json({ error: 'Item not found.' });
  store.delete(req.params.id);
  res.json({ success: true });
});

export const libraryRoute = router;
