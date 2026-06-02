// src/controllers/scansController.js
// Gestion des scans de codes-barres

const barcodeService = require('../services/barcodeService');
const logger = require('../config/logger');

// ── Scanner article ────────────────────────────────────────────────────

const scannerArticle = async (req, res) => {
  try {
    const { code_barres, contexte } = req.body;
    const user_id = req.utilisateur.id;

    if (!code_barres || code_barres.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Code-barres requis'
      });
    }

    // Valider le format du code-barres
    const validation = barcodeService.validerCodeBarres(code_barres);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Format de code-barres invalide',
        validation
      });
    }

    // Chercher et enregistrer le scan
    const scan_result = await barcodeService.enregistrerScan(
      'article',
      code_barres,
      user_id,
      { ...contexte, ip_address: req.ip }
    );

    if (!scan_result.success) {
      return res.status(404).json(scan_result);
    }

    logger.info(`Article scanné: ${code_barres} par ${req.utilisateur.email}`);

    return res.json({
      success: true,
      scan_id: scan_result.scan_id,
      timestamp: scan_result.timestamp,
      article: scan_result.data.article,
      alternatives: scan_result.data.alternatives || [],
      message: `Article trouvé: ${scan_result.data.article.designation}`
    });
  } catch (error) {
    logger.error('Erreur scan article:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors du scan',
      error: error.message
    });
  }
};

// ── Scanner véhicule ──────────────────────────────────────────────────

const scannerVehicule = async (req, res) => {
  try {
    const { immatriculation, contexte } = req.body;
    const user_id = req.utilisateur.id;

    if (!immatriculation || immatriculation.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Immatriculation requise'
      });
    }

    const scan_result = await barcodeService.enregistrerScan(
      'vehicule',
      immatriculation,
      user_id,
      { ...contexte, ip_address: req.ip }
    );

    if (!scan_result.success) {
      return res.status(404).json(scan_result);
    }

    logger.info(`Véhicule scanné: ${immatriculation} par ${req.utilisateur.email}`);

    return res.json({
      success: true,
      scan_id: scan_result.scan_id,
      timestamp: scan_result.timestamp,
      vehicule: scan_result.data.vehicule,
      message: `Véhicule trouvé: ${scan_result.data.vehicule.immatriculation}`
    });
  } catch (error) {
    logger.error('Erreur scan véhicule:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors du scan',
      error: error.message
    });
  }
};

// ── Rechercher article sans scanner (fallback) ─────────────────────────

const rechercherArticle = async (req, res) => {
  try {
    const { code_barres } = req.query;

    if (!code_barres) {
      return res.status(400).json({
        success: false,
        message: 'Code-barres requis'
      });
    }

    const result = await barcodeService.trouverArticleParCodeBarres(code_barres);

    return res.json(result);
  } catch (error) {
    logger.error('Erreur recherche article:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

// ── Valider code-barres ────────────────────────────────────────────────

const validerBarcode = async (req, res) => {
  try {
    const { code_barres } = req.body;

    if (!code_barres) {
      return res.status(400).json({
        success: false,
        message: 'Code-barres requis'
      });
    }

    const validation = barcodeService.validerCodeBarres(code_barres);

    return res.json({
      success: true,
      code_barres,
      validation,
      est_valide: validation.valid
    });
  } catch (error) {
    logger.error('Erreur validation barcode:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

// ── Générer code-barres pour article ───────────────────────────────────

const genererCodeBarresArticle = async (req, res) => {
  try {
    const { article_id } = req.params;

    if (!article_id) {
      return res.status(400).json({
        success: false,
        message: 'ID article requis'
      });
    }

    const result = await barcodeService.genererCodeBarres(article_id);

    return res.json(result);
  } catch (error) {
    logger.error('Erreur génération code-barres:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

// ── Historique scans ───────────────────────────────────────────────────

const obtenirScans = async (req, res) => {
  try {
    const { type_scan, user_id, date_debut, date_fin, limite = 50 } = req.query;

    const result = await barcodeService.obtenirHistoriqueScans({
      type_scan,
      user_id,
      date_debut,
      date_fin,
      limite: parseInt(limite)
    });

    return res.json(result);
  } catch (error) {
    logger.error('Erreur historique scans:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

module.exports = {
  scannerArticle,
  scannerVehicule,
  rechercherArticle,
  validerBarcode,
  genererCodeBarresArticle,
  obtenirScans
};
