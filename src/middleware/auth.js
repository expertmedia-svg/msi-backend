// src/middleware/auth.js
// Middleware d'authentification JWT et contrôle d'accès par rôle

const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const logger = require('../config/logger');

/**
 * Vérifie le token JWT et charge l'utilisateur
 */
const authentifier = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token d\'authentification manquant'
      });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Session expirée, veuillez vous reconnecter' });
      }
      return res.status(401).json({ success: false, message: 'Token invalide' });
    }

    // Charger l'utilisateur depuis la base
    const result = await query(
      `SELECT u.id, u.nom, u.prenom, u.email, u.role_id, u.actif,
              u.site, u.departement, u.verrouille_jusqu_a,
              r.code AS role_code, r.permissions
       FROM utilisateurs u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (!result.rows[0]) {
      return res.status(401).json({ success: false, message: 'Utilisateur introuvable' });
    }

    const utilisateur = result.rows[0];

    // Vérifier si le compte est actif
    if (!utilisateur.actif) {
      return res.status(403).json({ success: false, message: 'Compte désactivé' });
    }

    // Vérifier si le compte est verrouillé
    if (utilisateur.verrouille_jusqu_a && new Date(utilisateur.verrouille_jusqu_a) > new Date()) {
      return res.status(423).json({
        success: false,
        message: `Compte temporairement verrouillé jusqu'à ${new Date(utilisateur.verrouille_jusqu_a).toLocaleString('fr-FR')}`
      });
    }

    req.utilisateur = utilisateur;
    next();
  } catch (err) {
    logger.error('Erreur middleware auth:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * Vérifie les permissions sur un module/action
 * @param {string} module - Nom du module (achats, stocks, equipements, flotte)
 * @param {string} action - Action (lire, creer, modifier, supprimer, valider)
 */
const autoriser = (module, action = 'lire') => {
  return (req, res, next) => {
    const { permissions, role_code } = req.utilisateur;

    // Admin a tous les droits
    if (role_code === 'admin' || permissions['*']?.['*']) {
      return next();
    }

    // Vérifier permission spécifique
    const permModule = permissions[module];
    if (!permModule) {
      return res.status(403).json({
        success: false,
        message: `Accès refusé au module ${module}`
      });
    }

    if (permModule['*'] || permModule[action]) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Action '${action}' non autorisée sur le module ${module}`
    });
  };
};

/**
 * Vérifie qu'un rôle spécifique est requis
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (roles.includes(req.utilisateur.role_code)) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: 'Rôle insuffisant pour cette action'
    });
  };
};

module.exports = { authentifier, autoriser, requireRole };
