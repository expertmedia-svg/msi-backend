// src/routes/referentiel.js
const express = require('express');
const router = express.Router();
const { authentifier } = require('../middleware/auth');
const { query } = require('../config/database');

router.use(authentifier);

// Articles
router.get('/articles', async (req, res) => {
  const { recherche, categorie } = req.query;
  const conds = ['actif = TRUE'];
  const params = [];
  if (recherche) { params.push(`%${recherche}%`); conds.push(`(designation ILIKE $${params.length} OR code ILIKE $${params.length})`); }
  if (categorie) { params.push(categorie); conds.push(`categorie = $${params.length}`); }
  const r = await query(`SELECT * FROM articles WHERE ${conds.join(' AND ')} ORDER BY designation LIMIT 100`, params);
  res.json({ success: true, data: r.rows });
});

router.post('/articles', async (req, res) => {
  const { code, designation, description, categorie, unite_mesure, est_pharmaceutique } = req.body;
  const r = await query(
    `INSERT INTO articles (code, designation, description, categorie, unite_mesure, est_pharmaceutique)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [code, designation, description, categorie, unite_mesure, est_pharmaceutique || false]
  );
  res.status(201).json({ success: true, data: r.rows[0] });
});

// Magasins
router.get('/magasins', async (req, res) => {
  const r = await query(`SELECT m.*, s.nom AS site_nom FROM magasins m LEFT JOIN sites s ON m.site_id = s.id WHERE m.actif = TRUE ORDER BY m.nom`);
  res.json({ success: true, data: r.rows });
});

router.post('/magasins', async (req, res) => {
  const { code, nom, type, site_id } = req.body;
  const r = await query('INSERT INTO magasins (code, nom, type, site_id) VALUES ($1,$2,$3,$4) RETURNING *', [code, nom, type, site_id]);
  res.status(201).json({ success: true, data: r.rows[0] });
});

// Sites
router.get('/sites', async (req, res) => {
  const r = await query('SELECT * FROM sites WHERE actif = TRUE ORDER BY nom');
  res.json({ success: true, data: r.rows });
});

// Projets & bailleurs
router.get('/projets', async (req, res) => {
  const r = await query(`SELECT p.*, b.nom AS bailleur_nom FROM projets p LEFT JOIN bailleurs b ON p.bailleur_id = b.id WHERE p.statut = 'actif' ORDER BY p.nom`);
  res.json({ success: true, data: r.rows });
});

router.get('/bailleurs', async (req, res) => {
  const r = await query('SELECT * FROM bailleurs WHERE actif = TRUE ORDER BY nom');
  res.json({ success: true, data: r.rows });
});

// Devises
router.get('/devises', async (req, res) => {
  const r = await query('SELECT * FROM devises ORDER BY est_devise_base DESC, code');
  res.json({ success: true, data: r.rows });
});

// Catégories marché
router.get('/categories-marche', async (req, res) => {
  const r = await query('SELECT * FROM categories_marche ORDER BY libelle');
  res.json({ success: true, data: r.rows });
});

// Catégories équipement
router.get('/categories-equipement', async (req, res) => {
  const r = await query('SELECT * FROM categories_equipement ORDER BY libelle');
  res.json({ success: true, data: r.rows });
});

// Rôles
router.get('/roles', async (req, res) => {
  const r = await query('SELECT id, code, libelle FROM roles ORDER BY libelle');
  res.json({ success: true, data: r.rows });
});

// Seuils d'achat
router.get('/seuils-achat', async (req, res) => {
  const r = await query('SELECT * FROM seuils_achat WHERE actif = TRUE ORDER BY montant_min');
  res.json({ success: true, data: r.rows });
});

// Conducteurs autorisés
router.get('/conducteurs', async (req, res) => {
  const r = await query(
    `SELECT ca.*, u.nom, u.prenom FROM conducteurs_autorises ca
     JOIN utilisateurs u ON ca.utilisateur_id = u.id
     WHERE ca.actif = TRUE ORDER BY u.nom`
  );
  res.json({ success: true, data: r.rows });
});

module.exports = router;
