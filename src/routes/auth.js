// src/routes/auth.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validerRequete } = require('../middleware/validation');
const { authentifier } = require('../middleware/auth');
const ctrl = require('../controllers/authController');

router.post('/connexion',
  [body('email').isEmail(), body('mot_de_passe').notEmpty()],
  validerRequete, ctrl.connexion
);
router.post('/demande-reset-mot-de-passe', [body('email').isEmail()], validerRequete, ctrl.demandeResetMotDePasse);
router.post('/reset-mot-de-passe', [body('token').notEmpty(), body('nouveau_mot_de_passe').isLength({ min: 8 })], validerRequete, ctrl.resetMotDePasse);
router.get('/profil', authentifier, ctrl.profil);
router.put('/changer-mot-de-passe', authentifier, ctrl.changerMotDePasse);

module.exports = router;
