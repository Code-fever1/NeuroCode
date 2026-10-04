const express = require('express');
const app = express();

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/login', (_req, res) => {
  res.json({ token: 'ok' });
});

module.exports = app;
