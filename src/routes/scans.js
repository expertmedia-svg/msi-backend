// src/routes/scans.js
const express = require('express');
const router = express.Router();
const { authentifier, autoriser } = require('../middleware/auth');
const ctrl = require('../controllers/scansController');

router.use(authentifier);

/**
 * POST /api/scans/article
 * Scanner un article par code-barres
 */
router.post('/article', autoriser('stocks', 'achats', 'terrain'), ctrl.scannerArticle);

/**
 * POST /api/scans/vehicule
 * Scanner un véhicule par immatriculation
 */
router.post('/vehicule', autoriser('flotte', 'terrain'), ctrl.scannerVehicule);

/**
 * GET /api/scans/article
 * Rechercher article (fallback sans scanner)
 */
router.get('/article', autoriser('stocks', 'achats', 'terrain'), ctrl.rechercherArticle);

/**
 * POST /api/scans/valider
 * Valider un code-barres (format, checksum)
 */
router.post('/valider', ctrl.validerBarcode);

/**
 * GET /api/scans/generer/:article_id
 * Générer code-barres pour article
 */
router.get('/generer/:article_id', autoriser('stocks', 'admin'), ctrl.genererCodeBarresArticle);

/**
 * GET /api/scans/historique
 * Voir l'historique des scans
 */
router.get('/historique', autoriser('stocks', 'flotte', 'admin'), ctrl.obtenirScans);

module.exports = router;
