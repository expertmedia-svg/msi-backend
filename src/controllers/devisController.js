// src/controllers/devisController.js
// Gestion des devis et offres fournisseurs

const { query, transaction } = require('../config/database');
const logger = require('../config/logger');

// ── Tableau Comparatif Offres ──────────────────────────────────────────

const genererTableauComparatif = async (req, res) => {
  try {
    const { demande_devis_id } = req.params;

    // 1. Récupérer toutes les offres pour cette demande de devis
    const offres = await query(
      `SELECT
        of.id,
        f.id AS fournisseur_id,
        f.nom AS fournisseur_nom,
        f.score_qualite,
        of.delai_livraison_jours,
        of.conditions_paiement,
        of.validite_offre_jours,
        of.soumis_le,
        SUM(ol.prix_unitaire_fcfa * ol.quantite_disponible) AS montant_total_fcfa,
        COUNT(ol.id) AS nb_lignes,
        MIN(ol.prix_unitaire_fcfa) AS prix_min,
        MAX(ol.prix_unitaire_fcfa) AS prix_max,
        AVG(ol.prix_unitaire_fcfa) AS prix_moyen
       FROM offres_fournisseurs of
       JOIN demandes_devis_fournisseurs ddf ON of.ddq_fournisseur_id = ddf.id
       JOIN demandes_devis dd ON ddf.demande_devis_id = dd.id
       JOIN fournisseurs f ON ddf.fournisseur_id = f.id
       LEFT JOIN offres_lignes ol ON of.id = ol.offre_id
       WHERE dd.id = $1 AND ddf.statut = 'repondu'
       GROUP BY of.id, f.id, f.nom, f.score_qualite,
                of.delai_livraison_jours, of.conditions_paiement,
                of.validite_offre_jours, of.soumis_le
       ORDER BY montant_total_fcfa ASC`,
      [demande_devis_id]
    );

    if (offres.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aucune offre reçue pour cette demande'
      });
    }

    // 2. Analyser et créer le tableau avec statistiques
    const analyses = offres.rows.map((offre, index) => ({
      classement: index + 1,
      fournisseur_id: offre.fournisseur_id,
      fournisseur_nom: offre.fournisseur_nom,
      montant_total_fcfa: parseFloat(offre.montant_total_fcfa) || 0,
      delai_livraison_jours: offre.delai_livraison_jours,
      conditions_paiement: offre.conditions_paiement,
      score_qualite: offre.score_qualite || 0,
      validite_offre_jours: offre.validite_offre_jours,
      soumis_le: offre.soumis_le,
      nb_lignes: offre.nb_lignes,
      prix_stats: {
        min: parseFloat(offre.prix_min) || 0,
        max: parseFloat(offre.prix_max) || 0,
        moyen: parseFloat(offre.prix_moyen) || 0
      }
    }));

    // 3. Calculer statistiques globales
    const montants = analyses.map(a => a.montant_total_fcfa);
    const delais = analyses.map(a => a.delai_livraison_jours).filter(d => d);
    const scores = analyses.map(a => a.score_qualite).filter(s => s > 0);

    const stats_globales = {
      nb_offres: analyses.length,
      prix_min: Math.min(...montants),
      prix_max: Math.max(...montants),
      prix_moyen: montants.reduce((a, b) => a + b, 0) / montants.length,
      delai_min_jours: delais.length > 0 ? Math.min(...delais) : null,
      delai_max_jours: delais.length > 0 ? Math.max(...delais) : null,
      score_qualite_moyen: scores.length > 0 ?
        scores.reduce((a, b) => a + b, 0) / scores.length : 0
    };

    // 4. Recommandations
    const meilleur_prix = analyses.reduce((min, current) =>
      current.montant_total_fcfa < min.montant_total_fcfa ? current : min
    );

    const meilleur_delai = analyses.reduce((min, current) =>
      current.delai_livraison_jours < (min.delai_livraison_jours || Infinity) ? current : min
    );

    const meilleur_qualite = analyses.reduce((max, current) =>
      current.score_qualite > max.score_qualite ? current : max
    );

    // Score combiné: 40% prix, 30% délai, 30% qualité
    const analyses_scored = analyses.map(offre => {
      const score_prix = (stats_globales.prix_max - offre.montant_total_fcfa) /
                        (stats_globales.prix_max - stats_globales.prix_min) * 40;
      const score_delai = (meilleur_delai.delai_livraison_jours || 0) /
                         (offre.delai_livraison_jours || 999) * 30;
      const score_qualite = (offre.score_qualite / 100) * 30;

      return {
        ...offre,
        score_combine: score_prix + score_delai + score_qualite
      };
    });

    analyses_scored.sort((a, b) => b.score_combine - a.score_combine);

    const meilleur_offre = analyses_scored[0];

    return res.json({
      success: true,
      tableau: {
        stats_globales,
        offres: analyses_scored,
        meilleur_prix,
        meilleur_delai,
        meilleur_qualite,
        meilleur_offre_combinee: meilleur_offre,
        recommandation: `Offre recommandée: ${meilleur_offre.fournisseur_nom} (Score: ${meilleur_offre.score_combine.toFixed(2)}/100)`
      }
    });
  } catch (error) {
    logger.error('Erreur génération tableau comparatif:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la génération du tableau',
      error: error.message
    });
  }
};

// ── Enregistrer une offre fournisseur ──────────────────────────────────

const enregistrerOffre = async (req, res) => {
  try {
    const { demande_devis_fournisseur_id, lignes, delai_livraison_jours,
            conditions_paiement, validite_offre_jours, note_technique, fichier_proforma_url } = req.body;

    // Transaction pour enregistrer offre + lignes
    const offre = await transaction(async (client) => {
      // Créer l'offre
      const result = await client.query(
        `INSERT INTO offres_fournisseurs
         (ddq_fournisseur_id, delai_livraison_jours, conditions_paiement,
          validite_offre_jours, note_technique, fichier_proforma_url, soumis_le)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING *`,
        [demande_devis_fournisseur_id, delai_livraison_jours, conditions_paiement,
         validite_offre_jours, note_technique, fichier_proforma_url]
      );

      const offre_id = result.rows[0].id;

      // Enregistrer chaque ligne d'offre
      if (lignes && Array.isArray(lignes)) {
        for (let ligne of lignes) {
          const { demande_ligne_id, quantite_disponible, prix_unitaire, devise_id, commentaire } = ligne;

          // Récupérer le taux de change si pas FCFA
          let prix_fcfa = prix_unitaire;
          if (devise_id) {
            const devise_result = await client.query(
              `SELECT taux_vers_fcfa FROM devises WHERE id = $1`,
              [devise_id]
            );
            if (devise_result.rows.length > 0) {
              prix_fcfa = prix_unitaire * devise_result.rows[0].taux_vers_fcfa;
            }
          }

          await client.query(
            `INSERT INTO offres_lignes
             (offre_id, demande_ligne_id, quantite_disponible, prix_unitaire, devise_id, prix_unitaire_fcfa, commentaire)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [offre_id, demande_ligne_id, quantite_disponible, prix_unitaire, devise_id, prix_fcfa, commentaire]
          );
        }
      }

      // Mettre à jour statut de la demande devis fournisseur
      await client.query(
        `UPDATE demandes_devis_fournisseurs
         SET statut = 'repondu', date_reponse = NOW()
         WHERE id = $1`,
        [demande_devis_fournisseur_id]
      );

      return result.rows[0];
    });

    logger.info(`Offre enregistrée: ${offre.id}`);
    return res.status(201).json({
      success: true,
      offre
    });
  } catch (error) {
    logger.error('Erreur enregistrement offre:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'enregistrement de l\'offre',
      error: error.message
    });
  }
};

// ── Lister les offres pour une demande ──────────────────────────────────

const listerOffres = async (req, res) => {
  try {
    const { demande_devis_id } = req.params;
    const { page = 1, limite = 25 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limite);

    const [total, offres] = await Promise.all([
      query(
        `SELECT COUNT(DISTINCT of.id) FROM offres_fournisseurs of
         JOIN demandes_devis_fournisseurs ddf ON of.ddq_fournisseur_id = ddf.id
         WHERE ddf.demande_devis_id = $1`,
        [demande_devis_id]
      ),
      query(
        `SELECT of.*, f.nom AS fournisseur_nom, f.score_qualite,
                COUNT(ol.id) AS nb_lignes,
                SUM(ol.prix_unitaire_fcfa * ol.quantite_disponible) AS montant_total
         FROM offres_fournisseurs of
         JOIN demandes_devis_fournisseurs ddf ON of.ddq_fournisseur_id = ddf.id
         JOIN fournisseurs f ON ddf.fournisseur_id = f.id
         LEFT JOIN offres_lignes ol ON of.id = ol.offre_id
         WHERE ddf.demande_devis_id = $1
         GROUP BY of.id, f.nom, f.score_qualite
         ORDER BY of.soumis_le DESC
         LIMIT $2 OFFSET $3`,
        [demande_devis_id, parseInt(limite), offset]
      )
    ]);

    return res.json({
      success: true,
      pagination: {
        page: parseInt(page),
        limite: parseInt(limite),
        total: parseInt(total.rows[0].count)
      },
      offres: offres.rows
    });
  } catch (error) {
    logger.error('Erreur listing offres:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des offres',
      error: error.message
    });
  }
};

// ── Exporter tableau comparatif en PDF ──────────────────────────────────

const exporterComparatifPDF = async (req, res) => {
  try {
    const { demande_devis_id } = req.params;
    // Cette fonction sera implémentée ultérieurement avec pdfkit
    // Pour l'instant, on retourne le JSON
    const result = await genererTableauComparatif({ params: { demande_devis_id } }, {
      json: (data) => {
        res.json({ ...data, pdf: 'export en PDF (À implémenter avec pdfkit)' });
      }
    });
  } catch (error) {
    logger.error('Erreur export PDF:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'export PDF'
    });
  }
};

module.exports = {
  genererTableauComparatif,
  enregistrerOffre,
  listerOffres,
  exporterComparatifPDF
};
