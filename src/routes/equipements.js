// src/routes/equipements.js
const express = require('express');
const router = express.Router();
const { authentifier, autoriser } = require('../middleware/auth');
const ctrl = require('../controllers/equipementsController');

router.use(authentifier);
router.get('/', autoriser('equipements'), ctrl.listerEquipements);
router.get('/kpi', autoriser('equipements'), ctrl.kpiEquipements);
router.post('/', autoriser('equipements', 'creer'), ctrl.creerEquipement);
router.post('/:id/affecter', autoriser('equipements', 'modifier'), ctrl.affecterEquipement);
router.post('/:id/sortie', autoriser('equipements', 'modifier'), ctrl.sortirEquipement);

module.exports = router;
