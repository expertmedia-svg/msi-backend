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

// ── KPIs Directeur - Temps Réel ───────────────────────────────────

const kpisDirecteur = async (req, res) => {
  try {
    const { periode = 'mois' } = req.query; // 'semaine', 'mois', 'annee'

    let interval_sql = "INTERVAL '1 month'";
    let period_label = 'ce mois';
    if (periode === 'annee') {
      interval_sql = "INTERVAL '1 year'";
      period_label = 'cette année';
    } else if (periode === 'semaine') {
      interval_sql = "INTERVAL '1 week'";
      period_label = 'cette semaine';
    }

    // Requêtes parallèles pour KPIs directeur
    const [
      carburant_result,
      cout_km_result,
      rotation_stocks_result,
      taux_conformite_result,
      budget_engages_result
    ] = await Promise.all([
      // 1. CONSOMMATION CARBURANT
      query(`
        SELECT
          COUNT(DISTINCT vehicule_id) AS nb_vehicules,
          COALESCE(SUM(quantite_litres), 0) AS total_litres,
          COALESCE(AVG(prix_litre), 0) AS prix_moyen_litre,
          COALESCE(SUM(quantite_litres * prix_litre), 0) AS cout_total_carburant,
          ROUND(
            COALESCE(SUM(quantite_litres), 0) / NULLIF(
              (SELECT SUM(EXTRACT(EPOCH FROM (date_retour_reelle - date_depart)) / 1000 / 1000)
               FROM missions
               WHERE date_depart >= NOW() - ${interval_sql}
                 AND date_retour_reelle IS NOT NULL),
              0
            ) * 100, 2
          ) AS litre_pour_100km
        FROM approvisionnements_carburant
        WHERE created_at >= NOW() - ${interval_sql}
      `),

      // 2. COÛT / KM FLOTTE
      query(`
        SELECT
          COALESCE(SUM(m.montant), 0) AS cout_total_maintenance,
          COALESCE(SUM(ac.quantite_litres * ac.prix_litre), 0) AS cout_carburant,
          (SELECT COUNT(DISTINCT vehicule_id) FROM missions
           WHERE date_depart >= NOW() - ${interval_sql}) AS nb_vehicules_actifs,
          (SELECT SUM(EXTRACT(EPOCH FROM (date_retour_reelle - date_depart)) / 3600)
           FROM missions
           WHERE date_depart >= NOW() - ${interval_sql}
             AND date_retour_reelle IS NOT NULL) AS total_heures_mission,
          (SELECT SUM(km_parcourus)
           FROM missions
           WHERE date_depart >= NOW() - ${interval_sql}) AS total_km_parcourus,
          ROUND(
            (COALESCE(SUM(m.montant), 0) + COALESCE(SUM(ac.quantite_litres * ac.prix_litre), 0)) /
            NULLIF((SELECT SUM(km_parcourus)
                    FROM missions
                    WHERE date_depart >= NOW() - ${interval_sql}), 0),
            2
          ) AS cout_par_km
        FROM maintenances m
        LEFT JOIN approvisionnements_carburant ac ON 1=1
        WHERE m.created_at >= NOW() - ${interval_sql}
      `),

      // 3. ROTATION STOCKS (jours)
      query(`
        SELECT
          COUNT(DISTINCT article_id) AS nb_articles,
          ROUND(AVG(
            EXTRACT(DAY FROM (NOW() - MIN(date_entree)))
          ), 1) AS rotation_moyenne_jours,
          ROUND(AVG(
            (SELECT COUNT(DISTINCT id)
             FROM mouvements_stock
             WHERE article_id = articles.id
               AND type_mouvement = 'sortie'
               AND date_mouvement >= NOW() - ${interval_sql}) / 30
          ), 1) AS cmm_moyen,
          MIN(date_entree) AS stock_plus_ancien,
          MAX(date_sortie) AS dernier_mouvement
        FROM articles
        WHERE type = 'medicament'
          AND id IN (SELECT DISTINCT article_id FROM stocks WHERE quantite > 0)
      `),

      // 4. TAUX CONFORMITÉ ACHATS
      query(`
        SELECT
          COUNT(DISTINCT bc.id) AS nb_bc_total,
          COUNT(DISTINCT CASE WHEN bc.statut = 'livre_total' THEN bc.id END) AS nb_bc_conformes,
          ROUND(
            100.0 * COUNT(DISTINCT CASE WHEN bc.statut = 'livre_total' THEN bc.id END) /
            NULLIF(COUNT(DISTINCT bc.id), 0), 2
          ) AS taux_conformite_pct,
          COUNT(DISTINCT CASE WHEN bc.date_livraison_prevue < NOW() AND bc.statut != 'livre_total' THEN bc.id END) AS nb_bc_en_retard,
          ROUND(AVG(EXTRACT(DAY FROM (bc.date_livraison_reelle - bc.date_livraison_prevue)))
                FILTER (WHERE bc.date_livraison_reelle IS NOT NULL), 1) AS delai_moyen_jours
        FROM bons_commande bc
        WHERE bc.created_at >= NOW() - ${interval_sql}
      `),

      // 5. BUDGET ENGAGÉ
      query(`
        SELECT
          COALESCE(SUM(dal.quantite * dal.prix_unitaire_estime), 0) AS budget_dao_total,
          COALESCE(SUM(bcl.quantite_commandee * bcl.prix_unitaire), 0) AS budget_bc_engages,
          COALESCE((SELECT SUM(montant) FROM maintenances
                   WHERE created_at >= NOW() - ${interval_sql}), 0) AS budget_maintenance,
          COALESCE((SELECT SUM(quantite_litres * prix_litre) FROM approvisionnements_carburant
                   WHERE created_at >= NOW() - ${interval_sql}), 0) AS budget_carburant,
          (SELECT budget_total FROM projets ORDER BY created_at DESC LIMIT 1) AS budget_projet_total,
          ROUND(
            100.0 * (
              COALESCE(SUM(dal.quantite * dal.prix_unitaire_estime), 0) +
              COALESCE(SUM(bcl.quantite_commandee * bcl.prix_unitaire), 0)
            ) / NULLIF((SELECT budget_total FROM projets ORDER BY created_at DESC LIMIT 1), 1),
            2
          ) AS pct_budget_consomme
        FROM demandes_achat_lignes dal
        LEFT JOIN bons_commande_lignes bcl ON bcl.article_id = dal.article_id
        WHERE dal.created_at >= NOW() - ${interval_sql}
      `)
    ]);

    return res.json({
      success: true,
      periode: period_label,
      kpis: {
        carburant: {
          nb_vehicules: carburant_result.rows[0]?.nb_vehicules || 0,
          total_litres: parseFloat(carburant_result.rows[0]?.total_litres) || 0,
          litre_pour_100km: parseFloat(carburant_result.rows[0]?.litre_pour_100km) || 0,
          cout_total_fcfa: parseFloat(carburant_result.rows[0]?.cout_total_carburant) || 0,
          prix_moyen_litre: parseFloat(carburant_result.rows[0]?.prix_moyen_litre) || 0,
          trend: '↓ -2%' // À calculer vs période précédente
        },
        flotte: {
          cout_total_fcfa: (
            parseFloat(cout_km_result.rows[0]?.cout_total_maintenance) +
            parseFloat(cout_km_result.rows[0]?.cout_carburant)
          ),
          cout_par_km_fcfa: parseFloat(cout_km_result.rows[0]?.cout_par_km) || 0,
          nb_vehicules_actifs: cout_km_result.rows[0]?.nb_vehicules_actifs || 0,
          total_heures_mission: parseFloat(cout_km_result.rows[0]?.total_heures_mission) || 0,
          total_km_parcourus: parseFloat(cout_km_result.rows[0]?.total_km_parcourus) || 0
        },
        stocks: {
          rotation_moyenne_jours: parseFloat(rotation_stocks_result.rows[0]?.rotation_moyenne_jours) || 0,
          nb_articles: rotation_stocks_result.rows[0]?.nb_articles || 0,
          cmm_moyen: parseFloat(rotation_stocks_result.rows[0]?.cmm_moyen) || 0,
          stock_plus_ancien: rotation_stocks_result.rows[0]?.stock_plus_ancien || null,
          dernier_mouvement: rotation_stocks_result.rows[0]?.dernier_mouvement || null
        },
        achats: {
          nb_bc_total: taux_conformite_result.rows[0]?.nb_bc_total || 0,
          nb_bc_conformes: taux_conformite_result.rows[0]?.nb_bc_conformes || 0,
          taux_conformite_pct: parseFloat(taux_conformite_result.rows[0]?.taux_conformite_pct) || 0,
          nb_bc_en_retard: taux_conformite_result.rows[0]?.nb_bc_en_retard || 0,
          delai_moyen_jours: parseFloat(taux_conformite_result.rows[0]?.delai_moyen_jours) || 0
        },
        budget: {
          dao_total_fcfa: parseFloat(budget_engages_result.rows[0]?.budget_dao_total) || 0,
          bc_engages_fcfa: parseFloat(budget_engages_result.rows[0]?.budget_bc_engages) || 0,
          maintenance_fcfa: parseFloat(budget_engages_result.rows[0]?.budget_maintenance) || 0,
          carburant_fcfa: parseFloat(budget_engages_result.rows[0]?.budget_carburant) || 0,
          total_projet_fcfa: parseFloat(budget_engages_result.rows[0]?.budget_projet_total) || 0,
          pct_consomme: parseFloat(budget_engages_result.rows[0]?.pct_budget_consomme) || 0
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erreur KPIs directeur:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors du calcul des KPIs',
      error: error.message
    });
  }
};

// ── Résumé Exécutif ────────────────────────────────────────────────

const resumeExecutif = async (req, res) => {
  try {
    const resume = await query(`
      WITH data AS (
        SELECT
          'Demandes d\'achat' AS item,
          COUNT(*) AS count,
          'achats' AS module
        FROM demandes_achat WHERE statut IN ('soumis', 'en_validation')
        UNION ALL
        SELECT 'Articles en rupture', COUNT(*), 'stocks'
        FROM stocks WHERE quantite <= 0
        UNION ALL
        SELECT 'Maintenances en retard', COUNT(*), 'flotte'
        FROM maintenances
        WHERE prochaine_maintenance_date < NOW()
          AND date_realisation IS NULL
        UNION ALL
        SELECT 'Commandes en retard', COUNT(*), 'achats'
        FROM bons_commande
        WHERE date_livraison_prevue < NOW()
          AND statut NOT IN ('livre_total', 'annule')
      )
      SELECT * FROM data WHERE count > 0
      ORDER BY count DESC
      LIMIT 10
    `);

    return res.json({
      success: true,
      resume_critique: resume.rows,
      total_alertes_critiques: resume.rows.reduce((sum, r) => sum + r.count, 0)
    });
  } catch (error) {
    logger.error('Erreur résumé exécutif:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

module.exports = { getKpis, kpisDirecteur, resumeExecutif };
