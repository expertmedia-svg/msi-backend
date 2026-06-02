// src/routes/integration.js
// Routes des connecteurs API MSI : SUN / CLIC+ / ORION / MATE

const express = require('express');
const router = express.Router();
const { authentifier, requireRole } = require('../middleware/auth');
const {
  getConfigs, updateConfig, testConnection,
  syncSun, syncClicPlus, syncOrion, syncMate,
  getLogs, exportSunExcel,
} = require('../controllers/integrationController');

// Toutes les routes nécessitent authentification
router.use(authentifier);

// ── Configurations ──────────────────────────────────────────────
// GET  /api/integration/configs          → liste toutes les configs
// PUT  /api/integration/configs/:code    → mettre à jour une config
router.get('/configs', requireRole('admin', 'admin_systeme'), getConfigs);
router.put('/configs/:code', requireRole('admin', 'admin_systeme'), updateConfig);

// ── Tests de connexion ──────────────────────────────────────────
// POST /api/integration/test/:code       → tester connexion à un système
router.post('/test/:code', requireRole('admin', 'admin_systeme'), testConnection);

// ── Synchronisations ────────────────────────────────────────────
// POST /api/integration/sync/sun         → sync → SUN Systems
// POST /api/integration/sync/clic-plus   → sync → CLIC+
// POST /api/integration/sync/orion       → sync → ORION
// POST /api/integration/sync/mate        → sync → MATE
router.post('/sync/sun', requireRole('admin', 'admin_systeme', 'directeur', 'superviseur_logistique'), syncSun);
router.post('/sync/clic-plus', requireRole('admin', 'admin_systeme', 'directeur', 'superviseur_logistique'), syncClicPlus);
router.post('/sync/orion', requireRole('admin', 'admin_systeme', 'directeur', 'superviseur_logistique'), syncOrion);
router.post('/sync/mate', requireRole('admin', 'admin_systeme', 'directeur', 'superviseur_logistique'), syncMate);

// ── Exports fichiers ────────────────────────────────────────────
// GET /api/integration/sync/sun/excel    → télécharger Excel SUN
router.get('/sync/sun/excel', requireRole('admin', 'admin_systeme', 'directeur', 'superviseur_logistique', 'auditeur_bailleur'), exportSunExcel);

// ── Logs ────────────────────────────────────────────────────────
// GET /api/integration/logs              → historique des syncs
router.get('/logs', requireRole('admin', 'admin_systeme', 'directeur'), getLogs);

module.exports = router;
