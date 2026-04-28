// src/routes/justificatifs.js
// Routes pour upload et gestion des justificatifs

const express = require('express');
const router = express.Router();
const { authentifier } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { creerJustificatif, listerJustificatifs } = require('../controllers/justificatifsController');

router.use(authentifier);

/**
 * POST /api/justificatifs
 * Upload multipart - injecte req.params.module = 'justificatifs' pour multer
 */
router.post(
  '/',
  (req, res, next) => {
    req.params.module = 'justificatifs';
    next();
  },
  upload.single('file'),
  creerJustificatif
);

/**
 * GET /api/justificatifs
 * Lister avec filtres optionnels
 */
router.get('/', listerJustificatifs);

module.exports = router;
