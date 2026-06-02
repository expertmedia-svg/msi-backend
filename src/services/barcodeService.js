// src/services/barcodeService.js
// Service de gestion des codes-barres et scans

const { query } = require('../config/database');
const logger = require('../config/logger');

// ── Rechercher article par code-barres ────────────────────────────────

const trouverArticleParCodeBarres = async (code_barres) => {
  try {
    // Chercher d'abord par code_barres exact
    let result = await query(
      `SELECT a.*, s.quantite, s.cump, m.nom AS magasin_nom
       FROM articles a
       LEFT JOIN stocks s ON a.id = s.article_id
       LEFT JOIN magasins m ON s.magasin_id = m.id
       WHERE a.code_barres = $1
       LIMIT 1`,
      [code_barres]
    );

    if (result.rows.length > 0) {
      return {
        success: true,
        article: result.rows[0],
        source: 'code_barres_exact'
      };
    }

    // Essayer une recherche partielle (peut être tronqué)
    result = await query(
      `SELECT a.*, s.quantite, s.cump, m.nom AS magasin_nom
       FROM articles a
       LEFT JOIN stocks s ON a.id = s.article_id
       LEFT JOIN magasins m ON s.magasin_id = m.id
       WHERE a.code LIKE $1 OR a.designation LIKE $1
       LIMIT 5`,
      [`%${code_barres}%`]
    );

    if (result.rows.length > 0) {
      return {
        success: true,
        article: result.rows[0],
        alternatives: result.rows.slice(1),
        source: 'recherche_partielle'
      };
    }

    return {
      success: false,
      message: 'Article non trouvé',
      code_barres_recherche: code_barres
    };
  } catch (error) {
    logger.error('Erreur recherche article:', error);
    throw error;
  }
};

// ── Rechercher véhicule par immatriculation ────────────────────────────

const trouverVehiculeParImmatriculation = async (immatriculation) => {
  try {
    const result = await query(
      `SELECT v.*, e.designation AS equipement_nom,
              COUNT(DISTINCT m.id) AS nb_missions,
              (SELECT DATE(MAX(m.date_depart)) FROM missions m WHERE m.vehicule_id = v.id) AS derniere_mission
       FROM vehicules v
       LEFT JOIN equipements e ON v.equipement_id = e.id
       LEFT JOIN missions m ON v.id = m.vehicule_id
       WHERE v.immatriculation ILIKE $1
       GROUP BY v.id, e.designation
       LIMIT 1`,
      [immatriculation]
    );

    if (result.rows.length > 0) {
      return {
        success: true,
        vehicule: result.rows[0],
        source: 'immatriculation'
      };
    }

    return {
      success: false,
      message: 'Véhicule non trouvé',
      immatriculation_recherche: immatriculation
    };
  } catch (error) {
    logger.error('Erreur recherche véhicule:', error);
    throw error;
  }
};

// ── Valider et enregistrer un scan ────────────────────────────────────

const enregistrerScan = async (type_scan, code, user_id, contexte = {}) => {
  try {
    // Types acceptés: 'article', 'vehicule', 'reception', 'sortie'
    const types_acceptes = ['article', 'vehicule', 'reception', 'sortie'];
    if (!types_acceptes.includes(type_scan)) {
      return {
        success: false,
        message: 'Type de scan invalide'
      };
    }

    // Chercher l'objet scanné
    let objet_info;
    if (type_scan === 'article') {
      objet_info = await trouverArticleParCodeBarres(code);
    } else if (type_scan === 'vehicule') {
      objet_info = await trouverVehiculeParImmatriculation(code);
    }

    if (!objet_info.success) {
      return objet_info;
    }

    // Enregistrer le scan dans une table de logs
    const scan_record = await query(
      `INSERT INTO scans_codes
       (type_scan, code_scanne, objet_id, utilisateur_id, contexte, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        type_scan,
        code,
        type_scan === 'article' ? objet_info.article.id : objet_info.vehicule.id,
        user_id,
        JSON.stringify(contexte),
        contexte.ip_address || null
      ]
    );

    return {
      success: true,
      scan_id: scan_record.rows[0].id,
      timestamp: scan_record.rows[0].created_at,
      data: objet_info
    };
  } catch (error) {
    logger.error('Erreur enregistrement scan:', error);
    throw error;
  }
};

// ── Validation code-barres (checksum) ──────────────────────────────────

const validerCodeBarres = (code) => {
  // Validation EAN-13
  if (code.length === 13 && /^\d+$/.test(code)) {
    return validerEAN13(code);
  }

  // Validation EAN-8
  if (code.length === 8 && /^\d+$/.test(code)) {
    return validerEAN8(code);
  }

  // Format valide même si pas EAN
  return {
    valid: code.length > 0 && code.length <= 50,
    format: 'generic'
  };
};

const validerEAN13 = (code) => {
  const digits = code.split('').map(Number);
  let checksum = 0;

  for (let i = 0; i < 12; i++) {
    checksum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }

  const checkDigit = (10 - (checksum % 10)) % 10;
  const valid = checkDigit === digits[12];

  return {
    valid,
    format: 'EAN-13',
    checksum
  };
};

const validerEAN8 = (code) => {
  const digits = code.split('').map(Number);
  let checksum = 0;

  for (let i = 0; i < 7; i++) {
    checksum += digits[i] * (i % 2 === 0 ? 3 : 1);
  }

  const checkDigit = (10 - (checksum % 10)) % 10;
  const valid = checkDigit === digits[7];

  return {
    valid,
    format: 'EAN-8',
    checksum
  };
};

// ── Générer code-barres pour nouvel article ───────────────────────────

const genererCodeBarres = async (article_id) => {
  try {
    // Utiliser un algorithme simple: EAN-13 avec préfixe 977 (journals/périodiques)
    // Format: 977 + 7 chiffres d'ID + checksum

    const base = `977${String(article_id).padStart(7, '0')}`;
    const digits = base.split('').map(Number);
    let checksum = 0;

    for (let i = 0; i < 12; i++) {
      checksum += digits[i] * (i % 2 === 0 ? 1 : 3);
    }

    const checkDigit = (10 - (checksum % 10)) % 10;
    const code_barres = `${base}${checkDigit}`;

    return {
      success: true,
      code_barres,
      format: 'EAN-13'
    };
  } catch (error) {
    logger.error('Erreur génération code-barres:', error);
    throw error;
  }
};

// ── Historique scans ───────────────────────────────────────────────────

const obtenirHistoriqueScans = async (filtre = {}) => {
  try {
    const { type_scan, user_id, date_debut, date_fin, limite = 50 } = filtre;
    const conditions = [];
    const params = [];

    if (type_scan) {
      params.push(type_scan);
      conditions.push(`type_scan = $${params.length}`);
    }

    if (user_id) {
      params.push(user_id);
      conditions.push(`utilisateur_id = $${params.length}`);
    }

    if (date_debut) {
      params.push(date_debut);
      conditions.push(`created_at >= $${params.length}`);
    }

    if (date_fin) {
      params.push(date_fin);
      conditions.push(`created_at <= $${params.length}`);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(limite);

    const result = await query(
      `SELECT s.*, u.nom AS utilisateur_nom
       FROM scans_codes s
       LEFT JOIN utilisateurs u ON s.utilisateur_id = u.id
       ${where}
       ORDER BY s.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    return {
      success: true,
      scans: result.rows,
      total: result.rows.length
    };
  } catch (error) {
    logger.error('Erreur historique scans:', error);
    throw error;
  }
};

module.exports = {
  trouverArticleParCodeBarres,
  trouverVehiculeParImmatriculation,
  enregistrerScan,
  validerCodeBarres,
  genererCodeBarres,
  obtenirHistoriqueScans
};
