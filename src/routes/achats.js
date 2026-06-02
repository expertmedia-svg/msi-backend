// src/routes/achats.js
const express = require('express');
const router = express.Router();
const { authentifier, autoriser } = require('../middleware/auth');
const ctrl = require('../controllers/achatsController');
const devisCtrl = require('../controllers/devisController');

router.use(authentifier);
router.get('/kpi', autoriser('achats'), ctrl.kpiAchats);
router.get('/demandes', autoriser('achats'), ctrl.listerDemandes);
router.get('/demandes/:id/comparatif', autoriser('achats'), ctrl.genererTableauComparatif);
router.post('/demandes', autoriser('achats', 'creer'), ctrl.creerDemande);
router.put('/demandes/:id/valider', autoriser('achats', 'valider'), ctrl.validerDemande);
router.get('/commandes', autoriser('achats'), ctrl.listerCommandes);
router.post('/commandes', autoriser('achats', 'creer'), ctrl.creerCommande);
router.post('/receptions', autoriser('achats', 'creer'), ctrl.enregistrerReception);

// Routes devis (tableau comparatif)
router.get('/devis/:demande_devis_id/comparatif', autoriser('achats'), devisCtrl.genererTableauComparatif);
router.post('/devis', autoriser('achats', 'creer'), devisCtrl.enregistrerOffre);
router.get('/devis/:demande_devis_id', autoriser('achats'), devisCtrl.listerOffres);
router.get('/devis/:demande_devis_id/export', autoriser('achats'), devisCtrl.exporterComparatifPDF);

module.exports = router;
