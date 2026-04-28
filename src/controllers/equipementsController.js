// src/controllers/equipementsController.js
// Gestion des équipements (assets) et de la flotte motorisée

const { query, transaction } = require('../config/database');
const logger = require('../config/logger');
const QRCode = require('qrcode');

// ── ÉQUIPEMENTS ──────────────────────────────────────────────

const listerEquipements = async (req, res) => {
  try {
    const { statut, categorie_id, site_id, recherche, page = 1, limite = 25 } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (statut) { params.push(statut); conditions.push(`e.statut = $${params.length}`); }
    if (categorie_id) { params.push(categorie_id); conditions.push(`e.categorie_id = $${params.length}`); }
    if (site_id) { params.push(site_id); conditions.push(`e.site_id = $${params.length}`); }
    if (recherche) {
      params.push(`%${recherche}%`);
      conditions.push(`(e.designation ILIKE $${params.length} OR e.code_etiquette ILIKE $${params.length} OR e.code_serie ILIKE $${params.length})`);
    }

    const offset = (parseInt(page) - 1) * parseInt(limite);
    const where = conditions.join(' AND ');

    const [totalR, result] = await Promise.all([
      query(`SELECT COUNT(*) FROM equipements e WHERE ${where}`, params),
      query(
        `SELECT e.*,
                ce.libelle AS categorie_libelle,
                s.nom AS site_nom,
                ea.utilisateur_id AS affecte_a_id,
                u.nom AS affecte_nom, u.prenom AS affecte_prenom,
                ea.localisation_physique,
                CASE
                  WHEN e.duree_amortissement_ans > 0
                  THEN MAX(0.0, e.valeur_achat * (1.0 -
                    CAST((julianday(date('now')) - julianday(e.date_acquisition)) / 365.25 AS REAL) /
                    e.duree_amortissement_ans))
                  ELSE e.valeur_achat
                END AS valeur_residuelle_calculee
         FROM equipements e
         LEFT JOIN categories_equipement ce ON e.categorie_id = ce.id
         LEFT JOIN sites s ON e.site_id = s.id
         LEFT JOIN equipements_affectations ea ON ea.equipement_id = e.id AND ea.statut = 'actif'
         LEFT JOIN utilisateurs u ON ea.utilisateur_id = u.id
         WHERE ${where}
         ORDER BY e.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limite), offset]
      )
    ]);

    return res.json({
      success: true,
      data: result.rows,
      pagination: { total: parseInt(totalR.rows[0].count), page: parseInt(page), limite: parseInt(limite) }
    });
  } catch (err) {
    logger.error('Erreur liste équipements:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const creerEquipement = async (req, res) => {
  try {
    const {
      designation, categorie_id, marque, modele, annee_fabrication,
      code_serie, valeur_achat, devise_id, date_acquisition,
      duree_amortissement_ans, est_immobilisation, site_id
    } = req.body;

    const result = await transaction(async (client) => {
      // Générer code étiquette unique
      const countR = await client.query("SELECT COUNT(*)+1 AS n FROM equipements");
      const codeEtiquette = `MSI-${new Date().getFullYear()}-${String(countR.rows[0].n).padStart(5, '0')}`;

      // Générer QR code
      const qrDataUrl = await QRCode.toDataURL(codeEtiquette);

      const equipResult = await client.query(
        `INSERT INTO equipements
           (code_etiquette, code_serie, designation, categorie_id, marque, modele,
            annee_fabrication, valeur_achat, devise_id, date_acquisition,
            duree_amortissement_ans, est_immobilisation, site_id, code_barre_url, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [codeEtiquette, code_serie, designation, categorie_id, marque, modele,
         annee_fabrication, valeur_achat, devise_id, date_acquisition,
         duree_amortissement_ans, est_immobilisation || false, site_id, qrDataUrl, req.utilisateur.id]
      );

      return equipResult.rows[0];
    });

    return res.status(201).json({ success: true, data: result, message: 'Équipement enregistré' });
  } catch (err) {
    logger.error('Erreur création équipement:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const affecterEquipement = async (req, res) => {
  try {
    const { id } = req.params;
    const { utilisateur_id, site_id, localisation_physique, date_affectation } = req.body;

    await transaction(async (client) => {
      // Clôturer affectation précédente
      await client.query(
        `UPDATE equipements_affectations SET statut = 'retourne', date_retour = CURRENT_DATE
         WHERE equipement_id = $1 AND statut = 'actif'`,
        [id]
      );

      // Créer nouvelle affectation
      await client.query(
        `INSERT INTO equipements_affectations
           (equipement_id, utilisateur_id, site_id, localisation_physique, date_affectation, affecter_par)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, utilisateur_id, site_id, localisation_physique, date_affectation || new Date(), req.utilisateur.id]
      );

      // Mettre à jour site de l'équipement
      await client.query(
        `UPDATE equipements SET site_id = $1, updated_at = NOW() WHERE id = $2`,
        [site_id, id]
      );
    });

    return res.json({ success: true, message: 'Équipement affecté avec succès' });
  } catch (err) {
    logger.error('Erreur affectation équipement:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const sortirEquipement = async (req, res) => {
  try {
    const { id } = req.params;
    const { type_sortie, date_sortie, valeur_cession, beneficiaire, motif, texte_plainte } = req.body;

    await transaction(async (client) => {
      await client.query(
        `INSERT INTO equipements_sorties
           (equipement_id, type_sortie, date_sortie, valeur_cession,
            beneficiaire, motif, texte_plainte, valide_par, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
        [id, type_sortie, date_sortie, valeur_cession, beneficiaire, motif, texte_plainte, req.utilisateur.id]
      );

      await client.query(
        `UPDATE equipements SET statut = 'sorti', updated_at = NOW() WHERE id = $1`,
        [id]
      );

      // Clôturer affectations
      await client.query(
        `UPDATE equipements_affectations SET statut = 'retourne', date_retour = CURRENT_DATE
         WHERE equipement_id = $1 AND statut = 'actif'`,
        [id]
      );
    });

    return res.json({ success: true, message: 'Équipement sorti des actifs' });
  } catch (err) {
    logger.error('Erreur sortie équipement:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const kpiEquipements = async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) AS total_equipements,
        COUNT(CASE WHEN statut = 'en_service' THEN 1 END) AS en_service,
        COUNT(CASE WHEN statut = 'en_panne' THEN 1 END) AS en_panne,
        COUNT(CASE WHEN statut = 'sorti' THEN 1 END) AS sortis,
        COALESCE(SUM(CASE WHEN statut != 'sorti' THEN valeur_achat END), 0) AS valeur_totale_achat,
        COUNT(CASE WHEN est_immobilisation = TRUE AND statut != 'sorti' THEN 1 END) AS nb_immobilisations
      FROM equipements
    `);
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

// ── FLOTTE ──────────────────────────────────────────────────

const listerVehicules = async (req, res) => {
  try {
    const result = await query(
      `SELECT v.*,
              e.designation, e.photo_url,
              -- Alertes documents
              CASE
                WHEN v.carte_jaune_expiration <= CURRENT_DATE + INTERVAL '2 months' THEN TRUE ELSE FALSE
              END AS alerte_carte_jaune,
              CASE
                WHEN v.assurance_expiration <= CURRENT_DATE + INTERVAL '2 months' THEN TRUE ELSE FALSE
              END AS alerte_assurance,
              CASE
                WHEN v.visite_technique_expiration <= CURRENT_DATE + INTERVAL '2 months' THEN TRUE ELSE FALSE
              END AS alerte_visite_technique,
              -- Dernière mission
              (SELECT m.destination FROM missions m WHERE m.vehicule_id = v.id ORDER BY m.date_depart DESC LIMIT 1) AS derniere_mission,
              -- Consommation mois en cours
              COALESCE((
                SELECT SUM(ac.quantite_litres)
                FROM approvisionnements_carburant ac
                WHERE ac.vehicule_id = v.id
                  AND ac.date_approvisionnement >= date_trunc('month', CURRENT_DATE)
              ), 0) AS carburant_mois
       FROM vehicules v
       JOIN equipements e ON v.equipement_id = e.id
       WHERE v.actif = TRUE
       ORDER BY v.immatriculation`
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('Erreur liste véhicules:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const creerMission = async (req, res) => {
  try {
    const {
      vehicule_id, conducteur_id, site_depart_id, destination,
      date_depart, date_retour_prevue, km_depart, objectif, passagers
    } = req.body;

    const countR = await query("SELECT COUNT(*)+1 AS n FROM missions WHERE created_at >= date_trunc('year', NOW())");
    const numero = `MISS-${new Date().getFullYear()}-${String(countR.rows[0].n).padStart(4, '0')}`;

    const result = await query(
      `INSERT INTO missions
         (numero, vehicule_id, conducteur_id, site_depart_id, destination,
          date_depart, date_retour_prevue, km_depart, objectif, passagers, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [numero, vehicule_id, conducteur_id, site_depart_id, destination,
       date_depart, date_retour_prevue, km_depart, objectif, passagers, req.utilisateur.id]
    );

    // Mettre à jour statut mission
    await query(`UPDATE missions SET statut = 'en_cours' WHERE id = $1`, [result.rows[0].id]);

    return res.status(201).json({ success: true, data: result.rows[0], message: 'Mission créée' });
  } catch (err) {
    logger.error('Erreur création mission:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const enregistrerCarburant = async (req, res) => {
  try {
    const { vehicule_id, quantite_litres, prix_unitaire, fournisseur_carburant, bon_numero, km_compteur, mission_id } = req.body;

    const result = await query(
      `INSERT INTO approvisionnements_carburant
         (vehicule_id, quantite_litres, prix_unitaire, montant_total,
          fournisseur_carburant, bon_carburant_numero, km_compteur, mission_id, saisi_par)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [vehicule_id, quantite_litres, prix_unitaire,
       parseFloat(quantite_litres) * parseFloat(prix_unitaire),
       fournisseur_carburant, bon_numero, km_compteur, mission_id, req.utilisateur.id]
    );

    // Mettre à jour kilométrage
    if (km_compteur) {
      await query(`UPDATE vehicules SET kilometrage_actuel = $1 WHERE id = $2 AND $1 > kilometrage_actuel`, [km_compteur, vehicule_id]);
    }

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Erreur carburant:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const enregistrerMaintenance = async (req, res) => {
  try {
    const {
      vehicule_id, type_service, type_maintenance, description,
      date_realisation, km_compteur, garage_nom, montant,
      prochaine_maintenance_km, prochaine_maintenance_date
    } = req.body;

    const result = await query(
      `INSERT INTO maintenances
         (vehicule_id, type_service, type_maintenance, description,
          date_realisation, km_compteur, garage_nom, montant,
          prochaine_maintenance_km, prochaine_maintenance_date, realise_par)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [vehicule_id, type_service, type_maintenance, description,
       date_realisation, km_compteur, garage_nom, montant,
       prochaine_maintenance_km, prochaine_maintenance_date, req.utilisateur.id]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Erreur maintenance:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const kpiFlotte = async (req, res) => {
  try {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM vehicules WHERE actif = TRUE) AS nb_vehicules,
        (SELECT COUNT(*) FROM missions WHERE statut = 'en_cours') AS missions_en_cours,
        (SELECT COALESCE(SUM(quantite_litres), 0) FROM approvisionnements_carburant
         WHERE date_approvisionnement >= date_trunc('month', CURRENT_DATE)) AS carburant_mois,
        (SELECT COALESCE(SUM(montant_total), 0) FROM approvisionnements_carburant
         WHERE date_approvisionnement >= date_trunc('year', CURRENT_DATE)) AS cout_carburant_annee,
        (SELECT COALESCE(SUM(montant), 0) FROM maintenances
         WHERE date_realisation >= date_trunc('year', CURRENT_DATE)) AS cout_maintenance_annee,
        (SELECT COUNT(*) FROM incidents_vehicule WHERE statut = 'ouvert') AS incidents_ouverts,
        -- Alertes documents
        (SELECT COUNT(*) FROM vehicules
         WHERE actif = TRUE AND (
           carte_jaune_expiration <= CURRENT_DATE + INTERVAL '2 months' OR
           assurance_expiration <= CURRENT_DATE + INTERVAL '2 months' OR
           visite_technique_expiration <= CURRENT_DATE + INTERVAL '2 months'
         )) AS vehicules_avec_alertes_documents
    `);
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

// ── RETOUR MISSION ──────────────────────────────────────────

const cloturerMission = async (req, res) => {
  try {
    const { id } = req.params;
    const { km_retour, rapport_mission } = req.body;

    const missionRes = await query('SELECT * FROM missions WHERE id = $1', [id]);
    if (!missionRes.rows[0]) {
      return res.status(404).json({ success: false, message: 'Mission introuvable' });
    }

    const mission = missionRes.rows[0];
    if (mission.statut !== 'en_cours') {
      return res.status(400).json({ success: false, message: 'La mission n\'est pas en cours' });
    }

    if (km_retour && mission.km_depart && parseInt(km_retour) < parseInt(mission.km_depart)) {
      return res.status(400).json({ success: false, message: 'km_retour doit être >= km_depart' });
    }

    await query(
      `UPDATE missions SET
         statut = 'terminee',
         km_retour = COALESCE($1, km_retour),
         rapport_mission = COALESCE($2, rapport_mission),
         date_retour_reelle = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [km_retour || null, rapport_mission || null, id]
    );

    if (km_retour) {
      await query(
        `UPDATE vehicules SET kilometrage_actuel = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND $1 > COALESCE(kilometrage_actuel, 0)`,
        [km_retour, mission.vehicule_id]
      );
    }

    return res.json({ success: true, message: 'Mission clôturée avec succès' });
  } catch (err) {
    logger.error('Erreur clôture mission:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

// ── INCIDENTS VÉHICULES ─────────────────────────────────────

const listerIncidents = async (req, res) => {
  try {
    const { vehicule_id, statut, page = 1, limite = 25 } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (vehicule_id) {
      params.push(vehicule_id);
      conditions.push(`i.vehicule_id = $${params.length}`);
    }
    if (statut) {
      params.push(statut);
      conditions.push(`i.statut = $${params.length}`);
    }

    const offset = (parseInt(page) - 1) * parseInt(limite);
    const where = conditions.join(' AND ');

    const [totalRes, result] = await Promise.all([
      query(`SELECT COUNT(*) AS cnt FROM incidents_vehicule i WHERE ${where}`, params),
      query(
        `SELECT i.*,
                v.immatriculation, v.marque, v.modele,
                u.nom AS saisi_par_nom, u.prenom AS saisi_par_prenom
         FROM incidents_vehicule i
         JOIN vehicules v ON i.vehicule_id = v.id
         LEFT JOIN utilisateurs u ON i.saisi_par = u.id
         WHERE ${where}
         ORDER BY i.date_incident DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
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
    logger.error('Erreur liste incidents:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const creerIncident = async (req, res) => {
  try {
    const {
      vehicule_id, type_incident, date_incident, lieu, description,
      conducteur_id, blessures, degats_materiels, estimation_degats,
      rapport_police_numero
    } = req.body;

    if (!vehicule_id || !date_incident || !description) {
      return res.status(400).json({
        success: false,
        message: 'vehicule_id, date_incident et description sont requis'
      });
    }

    const result = await query(
      `INSERT INTO incidents_vehicule
         (vehicule_id, type_incident, date_incident, lieu, description,
          conducteur_id, blessures, degats_materiels, estimation_degats,
          rapport_police_numero, statut, saisi_par)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ouvert',$11) RETURNING *`,
      [vehicule_id, type_incident || 'autre', date_incident, lieu || null,
       description, conducteur_id || null,
       blessures ? 1 : 0, degats_materiels ? 1 : 0,
       estimation_degats || null, rapport_police_numero || null, req.utilisateur.id]
    );

    return res.status(201).json({ success: true, data: result.rows[0], message: 'Incident enregistré' });
  } catch (err) {
    logger.error('Erreur création incident:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const mettreAJourIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const { statut, note_resolution, estimation_degats, rapport_police_numero } = req.body;

    const incidentRes = await query('SELECT * FROM incidents_vehicule WHERE id = $1', [id]);
    if (!incidentRes.rows[0]) {
      return res.status(404).json({ success: false, message: 'Incident introuvable' });
    }

    await query(
      `UPDATE incidents_vehicule SET
         statut = COALESCE($1, statut),
         note_resolution = COALESCE($2, note_resolution),
         estimation_degats = COALESCE($3, estimation_degats),
         rapport_police_numero = COALESCE($4, rapport_police_numero),
         resolu_le = CASE WHEN $1 = 'resolu' THEN CURRENT_TIMESTAMP ELSE resolu_le END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [statut || null, note_resolution || null, estimation_degats || null,
       rapport_police_numero || null, id]
    );

    return res.json({ success: true, message: 'Incident mis à jour' });
  } catch (err) {
    logger.error('Erreur MAJ incident:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

module.exports = {
  listerEquipements, creerEquipement, affecterEquipement, sortirEquipement, kpiEquipements,
  listerVehicules, creerMission, enregistrerCarburant, enregistrerMaintenance, kpiFlotte,
  cloturerMission, listerIncidents, creerIncident, mettreAJourIncident
};
