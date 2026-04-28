// src/routes/dashboard.js
// Routes pour le dashboard consolidé

const express = require('express');
const router = express.Router();
const { authentifier } = require('../middleware/auth');
const { getKpis } = require('../controllers/dashboardController');

router.use(authentifier);

/**
 * GET /api/dashboard/kpis
 * Retourne KPIs consolidés de tous les modules
 */
router.get('/kpis', getKpis);

module.exports = router;
