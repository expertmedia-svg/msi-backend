// src/controllers/flotteController.js
// Gestion de la flotte : véhicules, maintenances, carburant

const { query, transaction } = require('../config/database');
const logger = require('../config/logger');

// ── Gestion Maintenances Préventives A/B/C ─────────────────────────────

const planifierMaintenancePreventive = async (req, res) => {
  try {
    const { vehicule_id, type_service, km_prochain, date_prochaine, description } = req.body;
    const user_id = req.utilisateur.id;

    // Types acceptés: 'A' (1000km), 'B' (10000km), 'C' (40000km)
    if (!['A', 'B', 'C'].includes(type_service)) {
      return res.status(400).json({
        success: false,
        message: 'Type de service invalide (A, B ou C)'
      });
    }

    const result = await query(
      `INSERT INTO maintenances
       (vehicule_id, type_service, type_maintenance, description,
        km_compteur, prochaine_maintenance_km, prochaine_maintenance_date, realise_par)
       VALUES ($1, $2, 'preventive', $3, 0, $4, $5, $6)
       RETURNING *`,
      [vehicule_id, type_service, description || `Maintenance préventive ${type_service}`, km_prochain, date_prochaine, user_id]
    );

    const maintenance = result.rows[0];
    logger.info(`Maintenance ${type_service} planifiée pour véhicule ${vehicule_id}`);

    return res.status(201).json({
      success: true,
      maintenance,
      message: `Maintenance ${type_service} planifiée`
    });
  } catch (error) {
    logger.error('Erreur planification maintenance:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la planification'
    });
  }
};

const alerterMaintenanceEchue = async (req, res) => {
  try {
    // Récupérer tous les véhicules avec maintenance à faire
    const alertes = await query(
      `SELECT v.id, v.immatriculation, v.kilometrage_actuel,
              m.id AS maintenance_id, m.type_service, m.km_compteur,
              m.prochaine_maintenance_km, m.prochaine_maintenance_date,
              (m.prochaine_maintenance_km - v.kilometrage_actuel) as km_restants,
              EXTRACT(DAY FROM m.prochaine_maintenance_date - NOW()) as jours_restants,
              u.nom AS responsable_nom, u.email AS responsable_email
       FROM maintenances m
       JOIN vehicules v ON m.vehicule_id = v.id
       JOIN utilisateurs u ON u.role_code = 'responsable_logistique'
       WHERE m.type_maintenance = 'preventive'
         AND m.date_realisation IS NULL
         AND (v.kilometrage_actuel >= COALESCE(m.prochaine_maintenance_km, 999999) - 500
              OR EXTRACT(DAY FROM m.prochaine_maintenance_date - NOW()) <= 7)
       ORDER BY m.type_service, m.prochaine_maintenance_date`
    );

    const alertes_groupees = {
      imminentes_km: alertes.rows.filter(a => (a.km_restants || 1000) <= 500),
      imminentes_date: alertes.rows.filter(a => (a.jours_restants || 100) <= 7),
      total: alertes.rows.length
    };

    return res.json({
      success: true,
      alertes: alertes_groupees
    });
  } catch (error) {
    logger.error('Erreur alerte maintenance:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des alertes'
    });
  }
};

const enregistrerMaintenanceEffectuee = async (req, res) => {
  try {
    const { maintenance_id, date_realisation, km_compteur, garage_nom, montant, facture_url, notes } = req.body;
    const user_id = req.utilisateur.id;

    // Récupérer la maintenance pour avoir le type de service
    const maintenance_prev = await query(
      `SELECT type_service FROM maintenances WHERE id = $1`,
      [maintenance_id]
    );

    if (maintenance_prev.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Maintenance non trouvée'
      });
    }

    const type_service = maintenance_prev.rows[0].type_service;

    // Calcul prochaine maintenance selon type
    const km_prochain_map = {
      'A': km_compteur + 1000,
      'B': km_compteur + 10000,
      'C': km_compteur + 40000
    };

    const km_prochain = km_prochain_map[type_service] || km_compteur + 5000;
    const date_prochaine = new Date(date_realisation);
    date_prochaine.setMonth(date_prochaine.getMonth() + (type_service === 'A' ? 1 : type_service === 'B' ? 6 : 12));

    const result = await query(
      `UPDATE maintenances
       SET date_realisation = $1,
           km_compteur = $2,
           garage_nom = $3,
           montant = $4,
           facture_url = $5,
           realise_par = $6,
           prochaine_maintenance_km = $7,
           prochaine_maintenance_date = $8
       WHERE id = $9
       RETURNING *`,
      [date_realisation, km_compteur, garage_nom, montant, facture_url, user_id, km_prochain, date_prochaine, maintenance_id]
    );

    logger.info(`Maintenance effectuée et enregistrée: ${maintenance_id}`);

    return res.json({
      success: true,
      maintenance: result.rows[0],
      message: 'Maintenance enregistrée avec succès'
    });
  } catch (error) {
    logger.error('Erreur enregistrement maintenance effectuée:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'enregistrement'
    });
  }
};

const historiqueMaintenance = async (req, res) => {
  try {
    const { vehicule_id } = req.params;
    const { page = 1, limite = 25 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limite);

    const [total, maintenances] = await Promise.all([
      query(
        `SELECT COUNT(*) FROM maintenances WHERE vehicule_id = $1`,
        [vehicule_id]
      ),
      query(
        `SELECT m.*, u.nom AS realise_par_nom
         FROM maintenances m
         LEFT JOIN utilisateurs u ON m.realise_par = u.id
         WHERE m.vehicule_id = $1
         ORDER BY m.date_realisation DESC, m.created_at DESC
         LIMIT $2 OFFSET $3`,
        [vehicule_id, parseInt(limite), offset]
      )
    ]);

    return res.json({
      success: true,
      pagination: {
        page: parseInt(page),
        limite: parseInt(limite),
        total: parseInt(total.rows[0].count)
      },
      maintenances: maintenances.rows
    });
  } catch (error) {
    logger.error('Erreur historique maintenance:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'historique'
    });
  }
};

const analyseConsommationCarburant = async (req, res) => {
  try {
    const { vehicule_id, periode = 'mois' } = req.query;

    let interval_sql = 'INTERVAL \'1 month\'';
    let period_label = 'ce mois';
    if (periode === 'annee') {
      interval_sql = 'INTERVAL \'1 year\'';
      period_label = 'cette année';
    } else if (periode === 'semaine') {
      interval_sql = 'INTERVAL \'1 week\'';
      period_label = 'cette semaine';
    }

    const result = await query(
      `SELECT v.id, v.immatriculation, v.type_carburant,
              COUNT(ac.id) AS nb_approvisionnements,
              SUM(ac.quantite_litres) AS total_litres,
              AVG(ac.prix_litre) AS prix_moyen_litre,
              SUM(ac.quantite_litres * ac.prix_litre) AS cout_total,
              (SELECT SUM(m.km_parcourus) FROM missions m
               WHERE m.vehicule_id = v.id
                 AND m.date_depart >= NOW() - ${interval_sql}) AS km_parcourus,
              ROUND(
                SUM(ac.quantite_litres) * 100.0 /
                COALESCE(
                  (SELECT SUM(m.km_parcourus) FROM missions m
                   WHERE m.vehicule_id = v.id
                     AND m.date_depart >= NOW() - ${interval_sql}),
                  1
                ),
                2
              ) AS litre_pour_100km
       FROM vehicules v
       LEFT JOIN approvisionnements_carburant ac ON v.id = ac.vehicule_id
         AND ac.created_at >= NOW() - ${interval_sql}
       WHERE v.id = $1 OR $1 IS NULL
       GROUP BY v.id, v.immatriculation, v.type_carburant`
    );

    return res.json({
      success: true,
      message: `Consommation carburant ${period_label}`,
      data: result.rows
    });
  } catch (error) {
    logger.error('Erreur analyse carburant:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'analyse'
    });
  }
};

const enregistrerApprovisionnemantCarburant = async (req, res) => {
  try {
    const { vehicule_id, quantite_litres, prix_litre, date_approvisionnement, lieu, numero_facture } = req.body;
    const user_id = req.utilisateur.id;

    const result = await query(
      `INSERT INTO approvisionnements_carburant
       (vehicule_id, quantite_litres, prix_litre, date_approvisionnement, lieu, numero_facture, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [vehicule_id, quantite_litres, prix_litre, date_approvisionnement || new Date(), lieu, numero_facture, user_id]
    );

    logger.info(`Approvisionnement carburant enregistré: ${result.rows[0].id}`);

    return res.status(201).json({
      success: true,
      approvisionnement: result.rows[0],
      message: 'Approvisionnement enregistré'
    });
  } catch (error) {
    logger.error('Erreur enregistrement carburant:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'enregistrement'
    });
  }
};

// ── KPIs Flotte ────────────────────────────────────────────────────────

const kpiBudgetFlotte = async (req, res) => {
  try {
    const { vehicule_id } = req.query;

    const budget = await query(
      `SELECT
        COUNT(DISTINCT v.id) AS nb_vehicules,
        SUM(m.montant) AS montant_maintenances,
        SUM(ac.quantite_litres * ac.prix_litre) AS cout_carburant,
        COUNT(DISTINCT m.id) AS nb_maintenances,
        AVG(m.montant) AS maintenance_moyenne,
        (SELECT SUM(montant) FROM maintenances WHERE type_service = 'A') AS cout_A,
        (SELECT SUM(montant) FROM maintenances WHERE type_service = 'B') AS cout_B,
        (SELECT SUM(montant) FROM maintenances WHERE type_service = 'C') AS cout_C
       FROM vehicules v
       LEFT JOIN maintenances m ON v.id = m.vehicule_id AND m.date_realisation >= NOW() - INTERVAL '1 year'
       LEFT JOIN approvisionnements_carburant ac ON v.id = ac.vehicule_id AND ac.created_at >= NOW() - INTERVAL '1 year'
       WHERE $1 IS NULL OR v.id = $1
       GROUP BY v.id`
    );

    return res.json({
      success: true,
      budget: budget.rows[0] || {}
    });
  } catch (error) {
    logger.error('Erreur KPI budget flotte:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors du calcul'
    });
  }
};

module.exports = {
  planifierMaintenancePreventive,
  alerterMaintenanceEchue,
  enregistrerMaintenanceEffectuee,
  historiqueMaintenance,
  analyseConsommationCarburant,
  enregistrerApprovisionnemantCarburant,
  kpiBudgetFlotte
};
