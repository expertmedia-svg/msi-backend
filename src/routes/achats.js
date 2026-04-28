// src/routes/achats.js
const express = require('express');
const router = express.Router();
const { authentifier, autoriser } = require('../middleware/auth');
const ctrl = require('../controllers/achatsController');

router.use(authentifier);
router.get('/kpi', autoriser('achats'), ctrl.kpiAchats);
router.get('/demandes', autoriser('achats'), ctrl.listerDemandes);
router.post('/demandes', autoriser('achats', 'creer'), ctrl.creerDemande);
router.put('/demandes/:id/valider', autoriser('achats', 'valider'), ctrl.validerDemande);
router.get('/commandes', autoriser('achats'), ctrl.listerCommandes);
router.post('/commandes', autoriser('achats', 'creer'), ctrl.creerCommande);
router.post('/receptions', autoriser('achats', 'creer'), ctrl.enregistrerReception);

module.exports = router;
