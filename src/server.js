// src/server.js
// Point d'entrée du serveur Express MSI BF

require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const cron = require('node-cron');

const logger = require('./config/logger');
const { initializeDatabase, query, saveDatabase, close } = require('./config/database');

// Routes
const authRoutes = require('./routes/auth');
const fournisseursRoutes = require('./routes/fournisseurs');
const achatsRoutes = require('./routes/achats');
const stocksRoutes = require('./routes/stocks');
const equipementsRoutes = require('./routes/equipements');
const flotteRoutes = require('./routes/flotte');
const rapportsRoutes = require('./routes/rapports');
const adminRoutes = require('./routes/admin');
const referentielRoutes = require('./routes/referentiel');
const dashboardRoutes = require('./routes/dashboard');
const justificatifsRoutes = require('./routes/justificatifs');

// Swagger
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware de sécurité ──────────────────────────────────

// Trust proxy (Nginx forward headers)
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
    }
  }
}));

app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'http://10.0.2.2:3000',    // émulateur Android → localhost
      'http://10.0.2.2:5173',    // web dev Android
      'capacitor://localhost',    // iOS Capacitor
      'http://localhost',         // localhost
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5175'
    ];
    // Permettre requêtes sans origin (apps natives, Postman)
    if (!origin || allowed.includes(origin)) {
      return callback(null, true);
    }
    // En développement, autoriser toutes les origines
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting global
app.use(rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { success: false, message: 'Trop de requêtes, veuillez réessayer plus tard.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  skip: (req) => process.env.NODE_ENV === 'test',
}));

// Rate limiting strict pour auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 100,
  message: { success: false, message: 'Trop de tentatives de connexion. Réessayez plus tard.' },
  keyGenerator: (req) => req.ip,
  skip: (req) => process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development',
});

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logs HTTP
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) }
  }));
}

// Fichiers statiques (uploads)
app.use('/uploads', express.static(path.join(process.env.UPLOAD_DIR || '/app/uploads')));

// ── Routes API ──────────────────────────────────────────────

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/fournisseurs', fournisseursRoutes);
app.use('/api/achats', achatsRoutes);
app.use('/api/stocks', stocksRoutes);
app.use('/api/equipements', equipementsRoutes);
app.use('/api/flotte', flotteRoutes);
app.use('/api/rapports', rapportsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/referentiel', referentielRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/justificatifs', justificatifsRoutes);

// Documentation API Swagger
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { background-color: #1B5E20; }',
  customSiteTitle: 'MSI BF - API Documentation'
}));

// Health check
app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    return res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: 'connected'
    });
  } catch {
    return res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

// 404
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route introuvable' });
});

// Gestion globale des erreurs
app.use((err, req, res, _next) => {
  logger.error('Erreur non gérée:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method
  });

  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: err.message });
  }

  return res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Erreur serveur interne' : err.message
  });
});

// ── Tâches planifiées ───────────────────────────────────────

// Bloquer comptes inactifs (chaque jour à 03h00)
cron.schedule('0 3 * * *', async () => {
  try {
    const inactiviteDays = parseInt(process.env.INACTIVITY_DAYS) || 45;
    const cutoff = new Date(Date.now() - inactiviteDays * 86400000).toISOString();
    await query(
      `UPDATE utilisateurs SET actif = 0
       WHERE derniere_connexion < ? AND actif = 1
         AND role_id NOT IN (SELECT id FROM roles WHERE code IN ('admin', 'admin_systeme'))`,
      [cutoff]
    );
    saveDatabase();
    logger.info('Tâche nuit : comptes inactifs vérifiés');
  } catch (err) {
    logger.error('Erreur blocage inactifs:', err);
  }
});

// ── Démarrage ───────────────────────────────────────────────

async function start() {
  await initializeDatabase();
  logger.info('✅ Base SQLite initialisée');

  // Seed automatique des utilisateurs de production si nécessaire
  try {
    const { query: dbQuery } = require('./config/database');
    const usersCount = await dbQuery('SELECT COUNT(*) as count FROM utilisateurs');
    if (usersCount.rows[0].count <= 2) { // Si seulement adminmsi et un autre
      logger.info('🌱 Peu d\'utilisateurs détectés. Lancement du seed production...');
      const seedProd = require('./database/seed-prod-users-logic');
      await seedProd();
    }
  } catch (err) {
    logger.warn('Avertissement seed auto:', err.message);
  }

  if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Serveur MSI BF démarré sur le port ${PORT}`);
      logger.info(`📚 Documentation API : http://localhost:${PORT}/api/docs`);
      logger.info(`🏥 Health check : http://localhost:${PORT}/health`);
    });
  }
}

if (process.env.NODE_ENV !== 'test') {
  start().catch(err => {
    logger.error('Erreur fatale au démarrage:', err.message);
    process.exit(1);
  });
}

module.exports = app;
