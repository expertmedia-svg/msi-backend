// src/routes/admin.js
const express = require('express');
const router = express.Router();
const { authentifier, requireRole } = require('../middleware/auth');
const { query } = require('../config/database');
const bcrypt = require('bcrypt');
const logger = require('../config/logger');

router.use(authentifier);
router.use(requireRole('admin', 'admin_systeme'));

// Liste utilisateurs
router.get('/utilisateurs', async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.nom, u.prenom, u.email, u.actif, u.site, u.departement,
              u.derniere_connexion, u.tentatives_echec, u.verrouille_jusqu_a,
              r.code AS role, r.libelle AS role_libelle
       FROM utilisateurs u JOIN roles r ON u.role_id = r.id
       ORDER BY u.nom, u.prenom`
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// Créer utilisateur
router.post('/utilisateurs', async (req, res) => {
  try {
    const { nom, prenom, email, role_id, site, departement, telephone } = req.body;
    // Mot de passe temporaire
    const mdpTemp = `MSI@${Math.random().toString(36).slice(2, 8).toUpperCase()}!`;
    const hash = await bcrypt.hash(mdpTemp, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    const result = await query(
      `INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe_hash, role_id, site, departement, telephone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, nom, prenom, email`,
      [nom, prenom, email.toLowerCase(), hash, role_id, site, departement, telephone]
    );

    // TODO: envoyer email avec mdpTemp
    logger.info(`Utilisateur créé: ${email}, mdp temp: ${mdpTemp}`);

    return res.status(201).json({
      success: true,
      data: result.rows[0],
      message: `Utilisateur créé. Mot de passe provisoire : ${mdpTemp}`
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: 'Email déjà utilisé' });
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// Activer/désactiver utilisateur
router.patch('/utilisateurs/:id/statut', async (req, res) => {
  try {
    const { actif } = req.body;
    await query('UPDATE utilisateurs SET actif = $1, updated_at = NOW() WHERE id = $2', [actif, req.params.id]);
    return res.json({ success: true, message: actif ? 'Compte activé' : 'Compte désactivé' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// Déverrouiller compte
router.patch('/utilisateurs/:id/deverrouiller', async (req, res) => {
  try {
    await query(
      'UPDATE utilisateurs SET tentatives_echec = 0, verrouille_jusqu_a = NULL WHERE id = $1',
      [req.params.id]
    );
    return res.json({ success: true, message: 'Compte déverrouillé' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// Journaux de connexion
router.get('/journaux', async (req, res) => {
  try {
    const { utilisateur_id, page = 1, limite = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limite);
    const cond = utilisateur_id ? `WHERE jc.utilisateur_id = '${utilisateur_id}'` : '';
    const result = await query(
      `SELECT jc.*, u.nom, u.prenom, u.email
       FROM journaux_connexion jc
       LEFT JOIN utilisateurs u ON jc.utilisateur_id = u.id
       ${cond}
       ORDER BY jc.created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limite), offset]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// Taux de change
router.put('/devises/:code/taux', async (req, res) => {
  try {
    const { taux } = req.body;
    await query('UPDATE devises SET taux_vers_fcfa = $1, updated_at = NOW() WHERE code = $2', [taux, req.params.code]);
    return res.json({ success: true, message: 'Taux de change mis à jour' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// Seed de données démo (pour présentation)
router.post('/demo-seed', async (req, res) => {
  try {
    const seedDemo = require('../database/seed-demo-data-logic');
    await seedDemo();
    return res.json({ success: true, message: 'Données de démonstration générées avec succès !' });
  } catch (err) {
    logger.error('Erreur demo-seed:', err);
    return res.status(500).json({ success: false, message: 'Erreur lors de la génération des données' });
  }
});

module.exports = router;
