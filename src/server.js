const express = require('express');
const path = require('path');
const db = require('./database');

async function startServer() {
  // Initialize database
  await db.initDb();
  console.log('✅ Banco de dados inicializado');

  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/api', require('./routes/api'));

  app.get('/game', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'game.html'));
  });

  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n⚔️  Village Wars rodando em http://localhost:${PORT}\n`);
  });
}

startServer().catch(err => {
  console.error('Erro ao iniciar servidor:', err);
  process.exit(1);
});
