// src/controllers/achatsController.js
// Gestion du cycle d'achat : demandes → devis → commandes → réceptions

const { query, transaction } = require('../config/database');
const logger = require('../config/logger');

// ── Demandes d'achat ──────────────────────────────────────────

const listerDemandes = async (req, res) => {
  try {
    const { statut, demandeur_id, projet_id, page = 1, limite = 25 } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (statut) { params.push(statut); conditions.push(`da.statut = $${params.length}`); }
    if (demandeur_id) { params.push(demandeur_id); conditions.push(`da.demandeur_id = $${params.length}`); }
    if (projet_id) { params.push(projet_id); conditions.push(`da.projet_id = $${params.length}`); }

    // Non-admins voient seulement leurs demandes ou celles à valider
    if (!['admin', 'admin_systeme', 'responsable_logistique', 'validateur'].includes(req.utilisateur.role_code)) {
      params.push(req.utilisateur.id);
      conditions.push(`da.demandeur_id = $${params.length}`);
    }

    const offset = (parseInt(page) - 1) * parseInt(limite);
    const where = conditions.join(' AND ');

    const [total, result] = await Promise.all([
      query(`SELECT COUNT(*) FROM demandes_achat da WHERE ${where}`, params),
      query(
        `SELECT da.*,
                u.nom AS demandeur_nom, u.prenom AS demandeur_prenom,
                p.nom AS projet_nom, s.nom AS site_nom,
                COUNT(dal.id) AS nb_lignes,
                SUM(dal.quantite * COALESCE(dal.prix_unitaire_estime, 0)) AS montant_total
         FROM demandes_achat da
         LEFT JOIN utilisateurs u ON da.demandeur_id = u.id
         LEFT JOIN projets p ON da.projet_id = p.id
         LEFT JOIN sites s ON da.site_id = s.id
         LEFT JOIN demandes_achat_lignes dal ON dal.demande_id = da.id
         WHERE ${where}
         GROUP BY da.id, u.nom, u.prenom, p.nom, s.nom
         ORDER BY da.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limite), offset]
      )
    ]);

    return res.json({
      success: true,
      data: result.rows,
      pagination: { total: parseInt(total.rows[0].count), page: parseInt(page), limite: parseInt(limite) }
    });
  } catch (err) {
    logger.error('Erreur liste demandes:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const creerDemande = async (req, res) => {
  try {
    const { titre, site_id, projet_id, ligne_budgetaire_id, priorite, date_besoin, justification, lignes } = req.body;

    if (!lignes || lignes.length === 0) {
      return res.status(400).json({ success: false, message: 'Au moins une ligne est requise' });
    }

    // Calculer montant estimé
    const montantEstime = lignes.reduce((sum, l) => sum + (parseFloat(l.quantite) * parseFloat(l.prix_unitaire_estime || 0)), 0);

    // Déterminer procédure d'achat selon seuils
    const seuilResult = await query(
      `SELECT procedure FROM seuils_achat
       WHERE $1 BETWEEN montant_min AND COALESCE(montant_max, 999999999999) AND actif = TRUE
       ORDER BY montant_min LIMIT 1`,
      [montantEstime]
    );
    const procedure = seuilResult.rows[0]?.procedure || 'devis_unique';

    const result = await transaction(async (client) => {
      // Générer numéro
      const countR = await client.query("SELECT COUNT(*)+1 AS n FROM demandes_achat WHERE created_at >= date_trunc('year', NOW())");
      const numero = `DA-${new Date().getFullYear()}-${String(countR.rows[0].n).padStart(4, '0')}`;

      const daResult = await client.query(
        `INSERT INTO demandes_achat
           (numero, titre, demandeur_id, site_id, projet_id, ligne_budgetaire_id,
            priorite, date_besoin, justification, montant_estime, procedure_applicable, statut)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'soumis') RETURNING *`,
        [numero, titre, req.utilisateur.id, site_id, projet_id, ligne_budgetaire_id,
         priorite || 'normale', date_besoin, justification, montantEstime, procedure]
      );

      const demandeId = daResult.rows[0].id;

      // Insérer les lignes
      for (let i = 0; i < lignes.length; i++) {
        const l = lignes[i];
        await client.query(
          `INSERT INTO demandes_achat_lignes
             (demande_id, article_id, description, quantite, unite_mesure, prix_unitaire_estime, ordre)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [demandeId, l.article_id, l.description, l.quantite, l.unite_mesure, l.prix_unitaire_estime, i + 1]
        );
      }

      return daResult.rows[0];
    });

    return res.status(201).json({ success: true, data: result, message: 'Demande d\'achat créée avec succès' });
  } catch (err) {
    logger.error('Erreur création demande achat:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const validerDemande = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, commentaire } = req.body; // action: 'approuver' | 'rejeter'

    const demandeResult = await query('SELECT * FROM demandes_achat WHERE id = $1', [id]);
    if (!demandeResult.rows[0]) {
      return res.status(404).json({ success: false, message: 'Demande introuvable' });
    }

    const nouveauStatut = action === 'approuver' ? 'approuve' : 'rejete';

    await transaction(async (client) => {
      await client.query(
        `UPDATE demandes_achat SET
           statut = $1,
           commentaire_rejet = $2,
           updated_at = NOW()
         WHERE id = $3`,
        [nouveauStatut, action === 'rejeter' ? commentaire : null, id]
      );

      await client.query(
        `INSERT INTO validations_achat (demande_id, niveau, validateur_id, statut, commentaire, date_validation)
         VALUES ($1, 1, $2, $3, $4, NOW())`,
        [id, req.utilisateur.id, action === 'approuver' ? 'approuve' : 'rejete', commentaire]
      );
    });

    return res.json({ success: true, message: `Demande ${action === 'approuver' ? 'approuvée' : 'rejetée'}` });
  } catch (err) {
    logger.error('Erreur validation demande:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

// ── Bons de commande ──────────────────────────────────────────

const listerCommandes = async (req, res) => {
  try {
    const { statut, fournisseur_id, projet_id, page = 1, limite = 25 } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (statut) { params.push(statut); conditions.push(`bc.statut = $${params.length}`); }
    if (fournisseur_id) { params.push(fournisseur_id); conditions.push(`bc.fournisseur_id = $${params.length}`); }
    if (projet_id) { params.push(projet_id); conditions.push(`bc.projet_id = $${params.length}`); }

    const offset = (parseInt(page) - 1) * parseInt(limite);
    const where = conditions.join(' AND ');

    const result = await query(
      `SELECT bc.*,
              f.nom AS fournisseur_nom,
              p.nom AS projet_nom,
              d.code AS devise_code,
              u.nom AS cree_par_nom,
              COUNT(bcl.id) AS nb_lignes
       FROM bons_commande bc
       LEFT JOIN fournisseurs f ON bc.fournisseur_id = f.id
       LEFT JOIN projets p ON bc.projet_id = p.id
       LEFT JOIN devises d ON bc.devise_id = d.id
       LEFT JOIN utilisateurs u ON bc.created_by = u.id
       LEFT JOIN bons_commande_lignes bcl ON bcl.commande_id = bc.id
       WHERE ${where}
       GROUP BY bc.id, f.nom, p.nom, d.code, u.nom
       ORDER BY bc.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limite), offset]
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('Erreur liste commandes:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const creerCommande = async (req, res) => {
  try {
    const {
      demande_achat_id, fournisseur_id, projet_id, ligne_budgetaire_id,
      date_livraison_prevue, lieu_livraison, conditions_paiement,
      devise_id, taux_change, notes, lignes
    } = req.body;

    const result = await transaction(async (client) => {
      const countR = await client.query("SELECT COUNT(*)+1 AS n FROM bons_commande WHERE created_at >= date_trunc('year', NOW())");
      const numero = `BC-${new Date().getFullYear()}-${String(countR.rows[0].n).padStart(4, '0')}`;

      const montantHt = lignes.reduce((s, l) => s + parseFloat(l.quantite_commandee) * parseFloat(l.prix_unitaire), 0);

      const bcResult = await client.query(
        `INSERT INTO bons_commande
           (numero, demande_achat_id, fournisseur_id, projet_id, ligne_budgetaire_id,
            date_livraison_prevue, lieu_livraison, conditions_paiement,
            montant_ht, montant_ttc, devise_id, taux_change, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [numero, demande_achat_id, fournisseur_id, projet_id, ligne_budgetaire_id,
         date_livraison_prevue, lieu_livraison, conditions_paiement,
         montantHt, montantHt, devise_id, taux_change || 1, notes, req.utilisateur.id]
      );

      for (let i = 0; i < lignes.length; i++) {
        const l = lignes[i];
        await client.query(
          `INSERT INTO bons_commande_lignes
             (commande_id, article_id, description, quantite_commandee, prix_unitaire, unite_mesure, ordre)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [bcResult.rows[0].id, l.article_id, l.description, l.quantite_commandee, l.prix_unitaire, l.unite_mesure, i + 1]
        );
      }

      return bcResult.rows[0];
    });

    return res.status(201).json({ success: true, data: result, message: 'Bon de commande créé' });
  } catch (err) {
    logger.error('Erreur création commande:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

// ── Réceptions ──────────────────────────────────────────────

const enregistrerReception = async (req, res) => {
  try {
    const {
      commande_id, site_id, bon_livraison_numero,
      lignes, non_conformites
    } = req.body;

    const result = await transaction(async (client) => {
      const countR = await client.query("SELECT COUNT(*)+1 AS n FROM receptions WHERE created_at >= date_trunc('year', NOW())");
      const numero = `REC-${new Date().getFullYear()}-${String(countR.rows[0].n).padStart(4, '0')}`;

      const recResult = await client.query(
        `INSERT INTO receptions
           (numero, commande_id, site_id, bon_livraison_numero, non_conformites, recu_par)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [numero, commande_id, site_id, bon_livraison_numero, non_conformites, req.utilisateur.id]
      );

      const recId = recResult.rows[0].id;

      for (const l of lignes) {
        await client.query(
          `INSERT INTO receptions_lignes
             (reception_id, commande_ligne_id, article_id, quantite_recue,
              quantite_acceptee, quantite_rejetee, motif_rejet, numero_lot, date_peremption)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [recId, l.commande_ligne_id, l.article_id, l.quantite_recue,
           l.quantite_acceptee, l.quantite_rejetee || 0, l.motif_rejet,
           l.numero_lot, l.date_peremption]
        );

        // Mettre à jour quantité reçue sur la ligne de commande
        await client.query(
          `UPDATE bons_commande_lignes SET quantite_recue = quantite_recue + $1 WHERE id = $2`,
          [l.quantite_acceptee, l.commande_ligne_id]
        );

        // Créer entrée en stock si quantité acceptée > 0
        if (parseFloat(l.quantite_acceptee) > 0) {
          // Récupérer prix unitaire de la commande
          const prixR = await client.query(
            'SELECT prix_unitaire FROM bons_commande_lignes WHERE id = $1',
            [l.commande_ligne_id]
          );
          const prixUnit = prixR.rows[0]?.prix_unitaire || 0;

          // Obtenir le magasin du site
          const magR = await client.query(
            'SELECT id FROM magasins WHERE site_id = $1 AND actif = TRUE LIMIT 1',
            [site_id]
          );
          const magId = magR.rows[0]?.id;

          if (magId) {
            // Créer lot
            const lotR = await client.query(
              `INSERT INTO lots
                 (article_id, magasin_id, numero_lot, quantite, date_peremption,
                  prix_unitaire, source, reception_id)
               VALUES ($1,$2,$3,$4,$5,$6,'achat',$7) RETURNING id`,
              [l.article_id, magId, l.numero_lot || `LOT-${Date.now()}`,
               l.quantite_acceptee, l.date_peremption, prixUnit, recId]
            );

            // Enregistrer mouvement
            await client.query(
              `INSERT INTO mouvements_stock
                 (type_mouvement, article_id, lot_id, magasin_dest_id, quantite, prix_unitaire, valeur, saisi_par)
               VALUES ('entree',$1,$2,$3,$4,$5,$6,$7)`,
              [l.article_id, lotR.rows[0].id, magId, l.quantite_acceptee,
               prixUnit, parseFloat(l.quantite_acceptee) * parseFloat(prixUnit), req.utilisateur.id]
            );
          }
        }
      }

      // Mettre à jour statut commande
      await client.query(
        `UPDATE bons_commande SET
           statut = CASE
             WHEN (SELECT SUM(quantite_commandee - quantite_recue) FROM bons_commande_lignes WHERE commande_id = $1) <= 0
             THEN 'livre_total'
             ELSE 'livre_partiel'
           END,
           updated_at = NOW()
         WHERE id = $1`,
        [commande_id]
      );

      return recResult.rows[0];
    });

    return res.status(201).json({ success: true, data: result, message: 'Réception enregistrée avec succès' });
  } catch (err) {
    logger.error('Erreur réception:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const kpiAchats = async (req, res) => {
  try {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM fournisseurs WHERE actif = TRUE) AS nb_fournisseurs_actifs,
        (SELECT COUNT(*) FROM fournisseurs WHERE liste_noire = TRUE) AS nb_liste_noire,
        (SELECT COUNT(*) FROM bons_commande WHERE statut IN ('confirme','en_cours','livre_partiel')) AS nb_commandes_en_cours,
        (SELECT COUNT(*) FROM bons_commande WHERE statut = 'livre_total') AS nb_commandes_clôturees,
        (SELECT COUNT(*) FROM bons_commande WHERE statut = 'annule') AS nb_commandes_annulees,
        (SELECT COALESCE(SUM(montant_ht),0) FROM bons_commande WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())) AS volume_achats_annee,
        (SELECT COUNT(*) FROM demandes_achat WHERE statut IN ('soumis','en_validation')) AS demandes_en_attente,
        (SELECT COUNT(*) FROM bons_commande WHERE date_livraison_prevue < NOW() AND statut NOT IN ('livre_total','annule')) AS commandes_en_retard
    `);

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Erreur KPI achats:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

// ── Comparateur de Devis ────────────────────────────────────────

const genererTableauComparatif = async (req, res) => {
  try {
    const { id } = req.params; // demande_devis_id (ou on peut adapter pour DA id)

    // On récupère toutes les offres liées à cette demande de devis
    const queryStr = `
      SELECT 
        f.id AS fournisseur_id, f.nom AS fournisseur_nom, f.note_globale,
        dal.description AS article_description, dal.quantite, dal.unite_mesure,
        ol.prix_unitaire, ol.prix_unitaire_fcfa
      FROM demandes_devis dd
      JOIN demandes_devis_fournisseurs ddf ON ddf.demande_devis_id = dd.id
      JOIN offres_fournisseurs ofour ON ofour.ddq_fournisseur_id = ddf.id
      JOIN offres_lignes ol ON ol.offre_id = ofour.id
      JOIN demandes_achat_lignes dal ON ol.demande_ligne_id = dal.id
      JOIN fournisseurs f ON ddf.fournisseur_id = f.id
      WHERE dd.id = $1 OR dd.demande_achat_id = $1
    `;
    const result = await query(queryStr, [id]);

    if (result.rows.length === 0) {
      return res.json({ success: true, data: null });
    }

    // Transformer pour le front (Matrice)
    const fournisseursMap = {};
    const articlesMap = {};
    const offres = [];

    result.rows.forEach(r => {
      fournisseursMap[r.fournisseur_id] = { 
        id: r.fournisseur_id, 
        nom: r.fournisseur_nom, 
        note_globale: r.note_globale 
      };
      articlesMap[r.article_description] = { 
        description: r.article_description, 
        quantite: r.quantite, 
        unite_mesure: r.unite_mesure 
      };
      offres.push({
        fournisseur_id: r.fournisseur_id,
        description: r.article_description,
        prix_unitaire: r.prix_unitaire_fcfa || r.prix_unitaire,
        quantite: r.quantite
      });
    });

    return res.json({
      success: true,
      data: {
        fournisseurs: Object.values(fournisseursMap),
        articles: Object.values(articlesMap),
        offres: offres
      }
    });
  } catch (err) {
    logger.error('Erreur comparateur devis:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

module.exports = { listerDemandes, creerDemande, validerDemande, listerCommandes, creerCommande, enregistrerReception, kpiAchats, genererTableauComparatif };
