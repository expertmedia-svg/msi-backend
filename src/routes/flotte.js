// src/routes/flotte.js
const express = require('express');
const router = express.Router();
const { authentifier, autoriser } = require('../middleware/auth');
const ctrl = require('../controllers/equipementsController');

router.use(authentifier);

// Véhicules & KPIs
router.get('/', autoriser('flotte'), ctrl.listerVehicules);
router.get('/kpi', autoriser('flotte'), ctrl.kpiFlotte);

// Missions
router.post('/missions', autoriser('flotte', 'creer'), ctrl.creerMission);
router.post('/missions/:id/retour', autoriser('flotte', 'modifier'), ctrl.cloturerMission);

// Carburant & Maintenance
router.post('/carburant', autoriser('flotte', 'creer'), ctrl.enregistrerCarburant);
router.post('/maintenances', autoriser('flotte', 'creer'), ctrl.enregistrerMaintenance);

// Incidents
router.get('/incidents', autoriser('flotte'), ctrl.listerIncidents);
router.post('/incidents', autoriser('flotte', 'creer'), ctrl.creerIncident);
router.put('/incidents/:id', autoriser('flotte', 'modifier'), ctrl.mettreAJourIncident);

module.exports = router;
