// src/controllers/dashboardController.js
// KPIs consolidés tous les modules - endpoint pour apps mobiles

const { query } = require('../config/database');
const logger = require('../config/logger');

/**
 * GET /api/dashboard/kpis
 * Retourne un objet consolidé avec KPIs de tous les modules
 */
const getKpis = async (req, res) => {
  try {
    // Requêtes parallèles pour chaque module
    const [
      achatsKpi,
      stocksKpi,
      equipementsKpi,
      flotteKpi,
      alertesStockRes,
      alertesVehiculesRes
    ] = await Promise.all([
      // ACHATS KPIs
      query(`
        SELECT
          CAST((SELECT COUNT(*) FROM fournisseurs WHERE actif = 1) AS INTEGER) AS nb_fournisseurs_actifs,
          CAST((SELECT COUNT(*) FROM bons_commande
                WHERE statut IN ('confirme','en_cours','livre_partiel')) AS INTEGER) AS nb_commandes_en_cours,
          CAST((SELECT COUNT(*) FROM demandes_achat
                WHERE statut IN ('soumis','en_validation')) AS INTEGER) AS demandes_en_attente,
          CAST((SELECT COALESCE(SUM(montant_ht), 0) FROM bons_commande
                WHERE strftime('%Y', created_at) = strftime('%Y', 'now')) AS INTEGER) AS volume_achats_annee,
          CAST((SELECT COUNT(*) FROM bons_commande
                WHERE date_livraison_prevue < date('now')
                  AND statut NOT IN ('livre_total', 'annule')) AS INTEGER) AS commandes_en_retard
      `),

      // STOCKS KPIs
      query(`
        SELECT
          CAST(COALESCE(SUM(valeur_totale), 0) AS INTEGER) AS valeur_totale_stock,
          CAST(COUNT(DISTINCT article_id) AS INTEGER) AS nb_references,
          CAST(COUNT(CASE WHEN quantite <= 0 THEN 1 END) AS INTEGER) AS nb_ruptures,
          CAST((SELECT COUNT(*) FROM alertes_stock WHERE statut = 'active') AS INTEGER) AS nb_alertes_actives,
          CAST((SELECT COUNT(*) FROM lots
                WHERE date_peremption <= date('now', '+6 months')
                  AND statut = 'disponible') AS INTEGER) AS nb_lots_proches_peremption
        FROM stocks
      `),

      // EQUIPEMENTS KPIs
      query(`
        SELECT
          CAST(COUNT(*) AS INTEGER) AS total,
          CAST(COUNT(CASE WHEN statut = 'en_service' THEN 1 END) AS INTEGER) AS en_service,
          CAST(COUNT(CASE WHEN statut = 'en_panne' THEN 1 END) AS INTEGER) AS en_panne,
          CAST(COALESCE(SUM(CASE WHEN statut != 'sorti' THEN valeur_achat ELSE 0 END), 0) AS INTEGER) AS valeur_totale_achat
        FROM equipements
      `),

      // FLOTTE KPIs
      query(`
        SELECT
          CAST((SELECT COUNT(*) FROM vehicules WHERE actif = 1) AS INTEGER) AS nb_vehicules,
          CAST((SELECT COUNT(*) FROM missions WHERE statut = 'en_cours') AS INTEGER) AS missions_en_cours,
          CAST((SELECT COALESCE(SUM(quantite_litres), 0) FROM approvisionnements_carburant
                WHERE date_approvisionnement >= strftime('%Y-%m-01', date('now'))) AS REAL) AS carburant_mois_litres,
          CAST((SELECT COALESCE(SUM(montant_total), 0) FROM approvisionnements_carburant
                WHERE strftime('%Y', date_approvisionnement) = strftime('%Y', date('now'))) AS INTEGER) AS cout_carburant_annee,
          CAST((SELECT COALESCE(SUM(montant), 0) FROM maintenances
                WHERE strftime('%Y', date_realisation) = strftime('%Y', date('now'))) AS INTEGER) AS cout_maintenance_annee,
          CAST((SELECT COUNT(*) FROM incidents_vehicule WHERE statut = 'ouvert') AS INTEGER) AS incidents_ouverts,
          CAST((SELECT COUNT(*) FROM vehicules
                WHERE actif = 1 AND (
                  carte_jaune_expiration <= date('now', '+2 months') OR
                  assurance_expiration <= date('now', '+2 months') OR
                  visite_technique_expiration <= date('now', '+2 months')
                )) AS INTEGER) AS vehicules_alertes_documents
      `),

      // Alertes stock
      query(`
        SELECT type_alerte, COUNT(*) AS nb
        FROM alertes_stock
        WHERE statut = 'active'
        GROUP BY type_alerte
      `),

      // Alertes documents véhicules
      query(`
        SELECT
          SUM(CASE WHEN carte_jaune_expiration <= date('now', '+2 months') THEN 1 ELSE 0 END) AS alerte_carte_jaune,
          SUM(CASE WHEN assurance_expiration <= date('now', '+2 months') THEN 1 ELSE 0 END) AS alerte_assurance,
          SUM(CASE WHEN visite_technique_expiration <= date('now', '+2 months') THEN 1 ELSE 0 END) AS alerte_visite
        FROM vehicules
        WHERE actif = 1
      `)
    ]);

    // Construire tableau alertes critiques
    const alertes = [];

    if (achatsKpi.rows[0]?.commandes_en_retard > 0) {
      alertes.push({
        type: 'commande_retard',
        module: 'achats',
        message: 'Commandes en retard',
        count: achatsKpi.rows[0].commandes_en_retard,
        severity: 'high'
      });
    }

    if (stocksKpi.rows[0]?.nb_ruptures > 0) {
      alertes.push({
        type: 'rupture_stock',
        module: 'stocks',
        message: 'Articles en rupture de stock',
        count: stocksKpi.rows[0].nb_ruptures,
        severity: 'critical'
      });
    }

    if (stocksKpi.rows[0]?.nb_lots_proches_peremption > 0) {
      alertes.push({
        type: 'peremption_proche',
        module: 'stocks',
        message: 'Lots proches de péremption',
        count: stocksKpi.rows[0].nb_lots_proches_peremption,
        severity: 'warning'
      });
    }

    if (flotteKpi.rows[0]?.incidents_ouverts > 0) {
      alertes.push({
        type: 'incident_ouvert',
        module: 'flotte',
        message: 'Incidents ouverts',
        count: flotteKpi.rows[0].incidents_ouverts,
        severity: 'high'
      });
    }

    if (flotteKpi.rows[0]?.vehicules_alertes_documents > 0) {
      alertes.push({
        type: 'documents_expiration',
        module: 'flotte',
        message: 'Documents à renouveler',
        count: flotteKpi.rows[0].vehicules_alertes_documents,
        severity: 'warning'
      });
    }

    return res.json({
      success: true,
      data: {
        achats: achatsKpi.rows[0],
        stocks: stocksKpi.rows[0],
        equipements: equipementsKpi.rows[0],
        flotte: flotteKpi.rows[0],
        alertes: alertes.slice(0, 10), // Top 10 alertes
        generated_at: new Date().toISOString()
      }
    });
  } catch (err) {
    logger.error('Erreur KPIs dashboard:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

module.exports = { getKpis };
