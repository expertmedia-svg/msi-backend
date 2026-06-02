// src/routes/stocks.js
const express = require('express');
const router = express.Router();
const { authentifier, autoriser } = require('../middleware/auth');
const ctrl = require('../controllers/stocksController');

router.use(authentifier);
router.get('/', autoriser('stocks'), ctrl.tableau);
router.get('/kpi', autoriser('stocks'), ctrl.kpi);
router.get('/lots', autoriser('stocks'), ctrl.listerLots);
router.get('/alertes', autoriser('stocks'), ctrl.alertes);
router.get('/journal', autoriser('stocks'), ctrl.journalMouvements);
router.get('/prevision-achat', autoriser('stocks'), ctrl.previsionAchat);
router.post('/mouvements', autoriser('stocks', 'creer'), ctrl.enregistrerMouvement);
router.post('/inventaires', autoriser('stocks', 'creer'), ctrl.creerInventaire);

// Routes FIFO/FEFO
router.post('/sortie/fifo-fefo', autoriser('stocks', 'creer'), ctrl.sortieStockFIFO_FEFO);
router.get('/analyse/pricing', autoriser('stocks'), ctrl.analyserMethodePricing);

// Routes alertes stocks
router.get('/alertes/verification', autoriser('stocks'), ctrl.verifierAlertes);
router.post('/alertes/generer', autoriser('stocks'), ctrl.creerAlertesAutomatiques);
router.put('/alertes/:id/acquitter', autoriser('stocks'), ctrl.acquitterAlerte);

// Routes non-conformités
router.post('/receptions/:reception_id/non-conformites', autoriser('stocks', 'creer'), ctrl.enregistrerNonConformite);
router.get('/receptions/:reception_id/non-conformites', autoriser('stocks'), ctrl.listerNonConformites);
router.get('/receptions/:reception_id/historique', autoriser('stocks'), ctrl.historiqueBonReception);
router.put('/non-conformites/:id/resoudre', autoriser('stocks', 'creer'), ctrl.resoudreNonConformite);

module.exports = router;
