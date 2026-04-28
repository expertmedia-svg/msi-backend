// src/routes/rapports.js
const express = require('express');
const router = express.Router();
const { authentifier, autoriser } = require('../middleware/auth');
const ctrl = require('../controllers/rapportsController');

router.use(authentifier);
router.get('/stocks/excel', autoriser('stocks'), ctrl.exportStocksExcel);
router.get('/achats/excel', autoriser('achats'), ctrl.exportAchatsExcel);
router.get('/flotte/excel', autoriser('flotte'), ctrl.exportFlotteExcel);
router.get('/equipements/pdf', autoriser('equipements'), ctrl.exportEquipementsPDF);

module.exports = router;
