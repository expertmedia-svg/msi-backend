// src/controllers/justificatifsController.js
// Gestion des pièces justificatives (photos, scans)

const { query } = require('../config/database');
const logger = require('../config/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * POST /api/justificatifs
 * Upload fichier + métadonnées
 * Body (multipart/form-data):
 *   - file: fichier (image JPG/PNG ou PDF)
 *   - type_document: ticket_carburant | facture | bon_livraison | recu | rapport_mission | autre
 *   - mission_id: (optionnel)
 *   - vehicule_id: (optionnel)
 *   - depense_id: (optionnel) - référence libre
 *   - type_depense: (optionnel) - carburant | maintenance | achat | autre
 *   - description: (optionnel)
 */
const creerJustificatif = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Fichier manquant' });
    }

    const { type_document, mission_id, vehicule_id, depense_id, type_depense, description } = req.body;

    if (!type_document) {
      return res.status(400).json({ success: false, message: 'type_document requis' });
    }

    const id = uuidv4();
    const fichierUrl = `/uploads/justificatifs/${req.file.filename}`;

    const result = await query(
      `INSERT INTO justificatifs
         (id, type_document, fichier_url, fichier_nom, taille_octets, mime_type,
          mission_id, vehicule_id, depense_id, type_depense, description, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      [
        id,
        type_document,
        fichierUrl,
        req.file.originalname,
        req.file.size,
        req.file.mimetype,
        mission_id || null,
        vehicule_id || null,
        depense_id || null,
        type_depense || null,
        description || null,
        req.utilisateur.id
      ]
    );

    logger.info(`Justificatif uploadé: ${id} par ${req.utilisateur.email}`);

    return res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Justificatif enregistré avec succès'
    });
  } catch (err) {
    logger.error('Erreur upload justificatif:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * GET /api/justificatifs
 * Lister pièces avec filtres optionnels
 * Query params:
 *   - mission_id: filter par mission
 *   - vehicule_id: filter par véhicule
 *   - type_document: filter par type
 *   - page: pagination (défaut 1)
 *   - limite: items par page (défaut 50)
 */
const listerJustificatifs = async (req, res) => {
  try {
    const { mission_id, vehicule_id, type_document, page = 1, limite = 50 } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (mission_id) {
      params.push(mission_id);
      conditions.push(`j.mission_id = ?`);
    }
    if (vehicule_id) {
      params.push(vehicule_id);
      conditions.push(`j.vehicule_id = ?`);
    }
    if (type_document) {
      params.push(type_document);
      conditions.push(`j.type_document = ?`);
    }

    const offset = (parseInt(page) - 1) * parseInt(limite);
    const where = conditions.join(' AND ');

    const [totalRes, result] = await Promise.all([
      query(`SELECT COUNT(*) AS cnt FROM justificatifs j WHERE ${where}`, params),
      query(
        `SELECT j.*,
                u.nom AS uploaded_par_nom,
                u.prenom AS uploaded_par_prenom,
                m.numero AS mission_numero,
                v.immatriculation AS vehicule_immatriculation
         FROM justificatifs j
         LEFT JOIN utilisateurs u ON j.uploaded_by = u.id
         LEFT JOIN missions m ON j.mission_id = m.id
         LEFT JOIN vehicules v ON j.vehicule_id = v.id
         WHERE ${where}
         ORDER BY j.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, parseInt(limite), offset]
      )
    ]);

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(totalRes.rows[0]?.cnt || 0),
        page: parseInt(page),
        limite: parseInt(limite)
      }
    });
  } catch (err) {
    logger.error('Erreur liste justificatifs:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

module.exports = { creerJustificatif, listerJustificatifs };
