// src/routes/flotte.js
const express = require('express');
const router = express.Router();
const { authentifier, autoriser } = require('../middleware/auth');
const ctrl = require('../controllers/equipementsController');
const flotte = require('../controllers/flotteController');

router.use(authentifier);

// Véhicules & KPIs
router.get('/', autoriser('flotte'), ctrl.listerVehicules);
router.get('/kpi', autoriser('flotte'), ctrl.kpiFlotte);
router.get('/kpi/budget', autoriser('flotte'), flotte.kpiBudgetFlotte);

// Missions
router.post('/missions', autoriser('flotte', 'creer'), ctrl.creerMission);
router.post('/missions/:id/retour', autoriser('flotte', 'modifier'), ctrl.cloturerMission);

// Carburant & Maintenance
router.post('/carburant', autoriser('flotte', 'creer'), ctrl.enregistrerCarburant);
router.get('/carburant/analyse', autoriser('flotte'), flotte.analyseConsommationCarburant);
router.post('/carburant/enregistrer', autoriser('flotte', 'creer'), flotte.enregistrerApprovisionnemantCarburant);

// Maintenances Préventives A/B/C
router.post('/maintenances', autoriser('flotte', 'creer'), ctrl.enregistrerMaintenance);
router.post('/maintenances/planifier', autoriser('flotte', 'creer'), flotte.planifierMaintenancePreventive);
router.get('/maintenances/alertes', autoriser('flotte'), flotte.alerterMaintenanceEchue);
router.put('/maintenances/:maintenance_id/effectuee', autoriser('flotte', 'modifier'), flotte.enregistrerMaintenanceEffectuee);
router.get('/maintenances/:vehicule_id/historique', autoriser('flotte'), flotte.historiqueMaintenance);

// Incidents
router.get('/incidents', autoriser('flotte'), ctrl.listerIncidents);
router.post('/incidents', autoriser('flotte', 'creer'), ctrl.creerIncident);
router.put('/incidents/:id', autoriser('flotte', 'modifier'), ctrl.mettreAJourIncident);

module.exports = router;
