// src/controllers/fournisseursController.js
// CRUD complet pour la gestion des fournisseurs

const { query, transaction } = require('../config/database');
const logger = require('../config/logger');

/**
 * GET /api/fournisseurs
 * Liste des fournisseurs avec filtres et pagination
 */
const lister = async (req, res) => {
  try {
    const {
      page = 1,
      limite = 25,
      recherche,
      categorie_id,
      liste_noire,
      actif = 'true'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limite);
    const conditions = ['1=1'];
    const params = [];

    if (recherche) {
      params.push(`%${recherche}%`);
      conditions.push(`(f.nom ILIKE $${params.length} OR f.code ILIKE $${params.length} OR f.email ILIKE $${params.length})`);
    }
    if (categorie_id) {
      params.push(categorie_id);
      conditions.push(`f.categorie_id = $${params.length}`);
    }
    if (liste_noire !== undefined) {
      params.push(liste_noire === 'true');
      conditions.push(`f.liste_noire = $${params.length}`);
    }
    if (actif !== 'tous') {
      params.push(actif === 'true');
      conditions.push(`f.actif = $${params.length}`);
    }

    const where = conditions.join(' AND ');

    const [resultTotal, resultFournisseurs] = await Promise.all([
      query(`SELECT COUNT(*) FROM fournisseurs f WHERE ${where}`, params),
      query(
        `SELECT f.*, cm.libelle AS categorie_libelle,
                COUNT(bc.id) AS nb_commandes,
                COALESCE(AVG(fe.note_globale), 0) AS note_moyenne
         FROM fournisseurs f
         LEFT JOIN categories_marche cm ON f.categorie_id = cm.id
         LEFT JOIN bons_commande bc ON bc.fournisseur_id = f.id
         LEFT JOIN fournisseurs_evaluations fe ON fe.fournisseur_id = f.id
         WHERE ${where}
         GROUP BY f.id, cm.libelle
         ORDER BY f.nom
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limite), offset]
      )
    ]);

    return res.json({
      success: true,
      data: resultFournisseurs.rows,
      pagination: {
        total: parseInt(resultTotal.rows[0].count),
        page: parseInt(page),
        limite: parseInt(limite),
        pages: Math.ceil(parseInt(resultTotal.rows[0].count) / parseInt(limite))
      }
    });
  } catch (err) {
    logger.error('Erreur liste fournisseurs:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * GET /api/fournisseurs/:id
 * Détail d'un fournisseur avec ses évaluations et documents
 */
const obtenir = async (req, res) => {
  try {
    const { id } = req.params;

    const [fResult, docsResult, evalsResult] = await Promise.all([
      query(
        `SELECT f.*, cm.libelle AS categorie_libelle
         FROM fournisseurs f
         LEFT JOIN categories_marche cm ON f.categorie_id = cm.id
         WHERE f.id = $1`,
        [id]
      ),
      query('SELECT * FROM fournisseurs_documents WHERE fournisseur_id = $1 ORDER BY created_at DESC', [id]),
      query(
        `SELECT fe.*, u.nom AS evaluateur_nom, u.prenom AS evaluateur_prenom
         FROM fournisseurs_evaluations fe
         JOIN utilisateurs u ON fe.evalue_par = u.id
         WHERE fe.fournisseur_id = $1
         ORDER BY fe.created_at DESC LIMIT 10`,
        [id]
      )
    ]);

    if (!fResult.rows[0]) {
      return res.status(404).json({ success: false, message: 'Fournisseur introuvable' });
    }

    return res.json({
      success: true,
      data: {
        ...fResult.rows[0],
        documents: docsResult.rows,
        evaluations: evalsResult.rows
      }
    });
  } catch (err) {
    logger.error('Erreur détail fournisseur:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * POST /api/fournisseurs
 * Créer un nouveau fournisseur
 */
const creer = async (req, res) => {
  try {
    const {
      nom, raison_sociale, categorie_id, adresse, ville, pays,
      telephone, email, site_web, nif, rccm,
      contact_nom, contact_telephone, contact_email
    } = req.body;

    // Générer code automatique
    const countResult = await query("SELECT COUNT(*) FROM fournisseurs WHERE created_at >= date_trunc('year', NOW())");
    const numero = parseInt(countResult.rows[0].count) + 1;
    const annee = new Date().getFullYear();
    const code = `FOUR-${annee}-${String(numero).padStart(4, '0')}`;

    const result = await query(
      `INSERT INTO fournisseurs
         (code, nom, raison_sociale, categorie_id, adresse, ville, pays,
          telephone, email, site_web, nif, rccm,
          contact_nom, contact_telephone, contact_email, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [code, nom, raison_sociale, categorie_id, adresse, ville, pays || 'Burkina Faso',
       telephone, email, site_web, nif, rccm,
       contact_nom, contact_telephone, contact_email, req.utilisateur.id]
    );

    return res.status(201).json({ success: true, data: result.rows[0], message: 'Fournisseur créé avec succès' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Un fournisseur avec cet email existe déjà' });
    }
    logger.error('Erreur création fournisseur:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * PUT /api/fournisseurs/:id
 * Modifier un fournisseur
 */
const modifier = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nom, raison_sociale, categorie_id, adresse, ville, pays,
      telephone, email, site_web, nif, rccm,
      contact_nom, contact_telephone, contact_email, actif
    } = req.body;

    const result = await query(
      `UPDATE fournisseurs SET
         nom=$1, raison_sociale=$2, categorie_id=$3, adresse=$4, ville=$5, pays=$6,
         telephone=$7, email=$8, site_web=$9, nif=$10, rccm=$11,
         contact_nom=$12, contact_telephone=$13, contact_email=$14, actif=$15,
         updated_at=NOW()
       WHERE id=$16 RETURNING *`,
      [nom, raison_sociale, categorie_id, adresse, ville, pays,
       telephone, email, site_web, nif, rccm,
       contact_nom, contact_telephone, contact_email, actif, id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'Fournisseur introuvable' });
    }

    return res.json({ success: true, data: result.rows[0], message: 'Fournisseur modifié avec succès' });
  } catch (err) {
    logger.error('Erreur modification fournisseur:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * PUT /api/fournisseurs/:id/liste-noire
 * Mettre/retirer un fournisseur de la liste noire
 */
const gererListeNoire = async (req, res) => {
  try {
    const { id } = req.params;
    const { ajouter, motif } = req.body;

    if (ajouter && !motif) {
      return res.status(400).json({ success: false, message: 'Le motif est obligatoire pour la liste noire' });
    }

    const result = await query(
      `UPDATE fournisseurs SET
         liste_noire = $1,
         motif_liste_noire = $2,
         date_liste_noire = $3,
         updated_at = NOW()
       WHERE id = $4 RETURNING id, nom, liste_noire`,
      [ajouter, ajouter ? motif : null, ajouter ? new Date() : null, id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, message: 'Fournisseur introuvable' });
    }

    return res.json({
      success: true,
      data: result.rows[0],
      message: ajouter ? 'Fournisseur ajouté à la liste noire' : 'Fournisseur retiré de la liste noire'
    });
  } catch (err) {
    logger.error('Erreur liste noire:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * POST /api/fournisseurs/:id/evaluations
 * Ajouter une évaluation fournisseur
 */
const ajouterEvaluation = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      commande_id, note_delais, note_qualite,
      note_conformite, note_communication, commentaire, fraude_signalee, detail_fraude
    } = req.body;

    const note_globale = (
      (parseFloat(note_delais) + parseFloat(note_qualite) +
       parseFloat(note_conformite) + parseFloat(note_communication)) / 4
    ).toFixed(2);

    const result = await query(
      `INSERT INTO fournisseurs_evaluations
         (fournisseur_id, commande_id, note_delais, note_qualite, note_conformite,
          note_communication, note_globale, commentaire, fraude_signalee, detail_fraude, evalue_par)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [id, commande_id, note_delais, note_qualite, note_conformite,
       note_communication, note_globale, commentaire, fraude_signalee || false, detail_fraude, req.utilisateur.id]
    );

    // Mettre à jour la note globale du fournisseur
    await query(
      `UPDATE fournisseurs SET
         note_globale = (SELECT AVG(note_globale) FROM fournisseurs_evaluations WHERE fournisseur_id = $1),
         updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Erreur évaluation fournisseur:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * POST /api/fournisseurs/:id/documents
 * Ajouter un document (vetting) au fournisseur
 */
const ajouterDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { type_document, date_expiration } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });
    }

    const chemin_fichier = `/uploads/${req.file.filename}`;
    const nom_fichier = req.file.originalname;

    const result = await query(
      `INSERT INTO fournisseurs_documents
         (fournisseur_id, type_document, nom_fichier, chemin_fichier, date_expiration, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, type_document, nom_fichier, chemin_fichier, date_expiration, req.utilisateur.id]
    );

    return res.status(201).json({ success: true, data: result.rows[0], message: 'Document ajouté avec succès' });
  } catch (err) {
    logger.error('Erreur ajout document fournisseur:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

module.exports = { lister, obtenir, creer, modifier, gererListeNoire, ajouterEvaluation, ajouterDocument };
