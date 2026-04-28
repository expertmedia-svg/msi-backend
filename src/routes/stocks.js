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

module.exports = router;
