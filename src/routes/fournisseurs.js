// src/routes/fournisseurs.js
const express = require('express');
const router = express.Router();
const { authentifier, autoriser } = require('../middleware/auth');
const ctrl = require('../controllers/fournisseursController');
const upload = require('../middleware/upload');

router.use(authentifier);
router.get('/', autoriser('achats'), ctrl.lister);
router.get('/:id', autoriser('achats'), ctrl.obtenir);
router.post('/', autoriser('achats', 'creer'), ctrl.creer);
router.put('/:id', autoriser('achats', 'modifier'), ctrl.modifier);
router.put('/:id/liste-noire', autoriser('achats', 'modifier'), ctrl.gererListeNoire);
router.post('/:id/evaluations', autoriser('achats', 'creer'), ctrl.ajouterEvaluation);
router.post('/:id/documents', autoriser('achats', 'modifier'), upload.single('fichier'), ctrl.ajouterDocument);

module.exports = router;
