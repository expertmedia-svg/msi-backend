// src/routes/dashboard.js
// Routes pour le dashboard consolidé

const express = require('express');
const router = express.Router();
const { authentifier, autoriser } = require('../middleware/auth');
const { getKpis, kpisDirecteur, resumeExecutif } = require('../controllers/dashboardController');

router.use(authentifier);

/**
 * GET /api/dashboard/kpis
 * Retourne KPIs consolidés de tous les modules
 */
router.get('/kpis', getKpis);

/**
 * GET /api/dashboard/directeur
 * KPIs spécifiques pour le directeur (temps réel)
 * Query: ?periode=semaine|mois|annee
 */
router.get('/directeur', autoriser('directeur'), kpisDirecteur);

/**
 * GET /api/dashboard/resume-executif
 * Top 10 des alertes critiques
 */
router.get('/resume-executif', autoriser('directeur', 'responsable_logistique'), resumeExecutif);

module.exports = router;
