// src/middleware/validation.js
const { validationResult } = require('express-validator');

const validerRequete = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Données invalides',
      erreurs: errors.array().map(e => ({ champ: e.path, message: e.msg }))
    });
  }
  next();
};

module.exports = { validerRequete };
