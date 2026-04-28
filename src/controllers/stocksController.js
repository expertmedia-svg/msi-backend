// src/controllers/stocksController.js
// Gestion complète des stocks : mouvements, CUMP, CMM, alertes

const { query, transaction } = require('../config/database');
const logger = require('../config/logger');

/**
 * GET /api/stocks
 * Vue d'ensemble des stocks par magasin et article
 */
const tableau = async (req, res) => {
  try {
    const { magasin_id, article_id, alerte_seulement } = req.query;
    const conditions = ['s.quantite >= 0'];
    const params = [];

    if (magasin_id) {
      params.push(magasin_id);
      conditions.push(`s.magasin_id = $${params.length}`);
    }
    if (article_id) {
      params.push(article_id);
      conditions.push(`s.article_id = $${params.length}`);
    }
    if (alerte_seulement === 'true') {
      conditions.push('(s.quantite <= s.stock_min OR s.quantite = 0)');
    }

    const result = await query(
      `SELECT s.*,
              a.code AS article_code, a.designation, a.unite_mesure,
              m.nom AS magasin_nom, m.type AS magasin_type,
              CASE
                WHEN s.quantite = 0 THEN 'rupture'
                WHEN s.quantite <= s.stock_min THEN 'stock_min'
                WHEN s.quantite >= s.stock_max AND s.stock_max > 0 THEN 'stock_max'
                ELSE 'normal'
              END AS statut_stock,
              -- CMM calculée sur 3 derniers mois
              COALESCE((
                SELECT SUM(ms.quantite) / 3
                FROM mouvements_stock ms
                WHERE ms.article_id = s.article_id
                  AND ms.magasin_source_id = s.magasin_id
                  AND ms.type_mouvement = 'sortie'
                  AND ms.date_mouvement >= NOW() - INTERVAL '3 months'
              ), 0) AS cmm_calculee,
              -- Jours de stock restants
              CASE
                WHEN COALESCE((
                  SELECT SUM(ms.quantite) / 90
                  FROM mouvements_stock ms
                  WHERE ms.article_id = s.article_id
                    AND ms.magasin_source_id = s.magasin_id
                    AND ms.type_mouvement = 'sortie'
                    AND ms.date_mouvement >= NOW() - INTERVAL '3 months'
                ), 0) > 0
                THEN s.quantite / (
                  SELECT SUM(ms.quantite) / 90
                  FROM mouvements_stock ms
                  WHERE ms.article_id = s.article_id
                    AND ms.magasin_source_id = s.magasin_id
                    AND ms.type_mouvement = 'sortie'
                    AND ms.date_mouvement >= NOW() - INTERVAL '3 months'
                )
                ELSE NULL
              END AS jours_stock
       FROM stocks s
       JOIN articles a ON s.article_id = a.id
       JOIN magasins m ON s.magasin_id = m.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.nom, a.designation`,
      params
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('Erreur tableau stock:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * GET /api/stocks/lots
 * Liste des lots avec dates de péremption
 */
const listerLots = async (req, res) => {
  try {
    const { magasin_id, article_id, statut, expiration_6_mois } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (magasin_id) { params.push(magasin_id); conditions.push(`l.magasin_id = $${params.length}`); }
    if (article_id) { params.push(article_id); conditions.push(`l.article_id = $${params.length}`); }
    if (statut) { params.push(statut); conditions.push(`l.statut = $${params.length}`); }
    if (expiration_6_mois === 'true') {
      conditions.push(`l.date_peremption <= NOW() + INTERVAL '6 months' AND l.statut = 'disponible'`);
    }

    const result = await query(
      `SELECT l.*,
              a.code AS article_code, a.designation, a.unite_mesure,
              m.nom AS magasin_nom,
              CAST(julianday(l.date_peremption) - julianday(date('now')) AS INTEGER) AS jours_avant_peremption
       FROM lots l
       JOIN articles a ON l.article_id = a.id
       JOIN magasins m ON l.magasin_id = m.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY CASE WHEN l.date_peremption IS NULL THEN 1 ELSE 0 END, l.date_peremption ASC`,
      params
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('Erreur liste lots:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * POST /api/stocks/mouvements
 * Enregistrer un mouvement de stock (entrée, sortie, transfert, etc.)
 */
const enregistrerMouvement = async (req, res) => {
  try {
    const {
      type_mouvement, article_id, lot_id,
      magasin_source_id, magasin_dest_id,
      quantite, prix_unitaire,
      reference_document, projet_id, destinataire, motif,
      numero_lot, date_peremption, source
    } = req.body;

    // Validation quantité
    if (parseFloat(quantite) <= 0) {
      return res.status(400).json({ success: false, message: 'La quantité doit être positive' });
    }

    const result = await transaction(async (client) => {
      let lotId = lot_id;

      // Créer le lot si c'est une entrée sans lot existant
      if (type_mouvement === 'entree' && !lot_id && numero_lot) {
        const lotResult = await client.query(
          `INSERT INTO lots (article_id, magasin_id, numero_lot, quantite, date_peremption,
                             date_reception, prix_unitaire, source)
           VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, $6, $7) RETURNING id`,
          [article_id, magasin_dest_id, numero_lot, quantite, date_peremption, prix_unitaire, source || 'achat']
        );
        lotId = lotResult.rows[0].id;
      }

      // Vérifier stock et FEFO pour sortie/transfert
      let lotsToDeduct = [];
      if (['sortie', 'transfert', 'elimination'].includes(type_mouvement)) {
        const stockResult = await client.query(
          'SELECT quantite FROM stocks WHERE article_id = $1 AND magasin_id = $2',
          [article_id, magasin_source_id]
        );
        const stockDispo = parseFloat(stockResult.rows[0]?.quantite || 0);
        if (stockDispo < parseFloat(quantite)) {
          throw new Error(`Stock insuffisant. Disponible: ${stockDispo}, Demandé: ${quantite}`);
        }

        if (!lot_id) {
          // Logique FEFO (First Expired First Out)
          const lotsResult = await client.query(
            `SELECT id, quantite, prix_unitaire FROM lots
             WHERE article_id = $1 AND magasin_id = $2 AND quantite > 0 AND statut = 'disponible'
             ORDER BY date_peremption ASC NULLS LAST`,
            [article_id, magasin_source_id]
          );

          let remainingQty = parseFloat(quantite);
          for (const l of lotsResult.rows) {
            if (remainingQty <= 0) break;
            const qtyToDeduct = Math.min(remainingQty, parseFloat(l.quantite));
            lotsToDeduct.push({ id: l.id, qty: qtyToDeduct, prix: l.prix_unitaire || prix_unitaire });
            remainingQty -= qtyToDeduct;
          }

          if (remainingQty > 0) {
            throw new Error(`Stock insuffisant dans les lots disponibles. Manque: ${remainingQty}`);
          }
        } else {
          lotsToDeduct.push({ id: lot_id, qty: parseFloat(quantite), prix: prix_unitaire });
        }
      } else {
        // Pour les entrées ou autres
        lotsToDeduct.push({ id: lotId, qty: parseFloat(quantite), prix: prix_unitaire });
      }

      // Mettre à jour les stocks globaux (un seul update par article/magasin)
      if (type_mouvement === 'entree') {
        const valeur = parseFloat(quantite) * parseFloat(prix_unitaire || 0);
        await client.query(
          `INSERT OR IGNORE INTO stocks (article_id, magasin_id, quantite, cump, valeur_totale)
           VALUES ($1, $2, 0, 0, 0)`,
          [article_id, magasin_dest_id]
        );
        await client.query(
          `UPDATE stocks SET
             cump = CASE
               WHEN quantite + $3 > 0 THEN (valeur_totale + $5) / (quantite + $3)
               ELSE $4
             END,
             quantite = quantite + $3,
             valeur_totale = valeur_totale + $5,
             updated_at = datetime('now')
           WHERE article_id = $1 AND magasin_id = $2`,
          [article_id, magasin_dest_id, quantite, prix_unitaire, valeur]
        );
      }

      if (['sortie', 'transfert', 'elimination'].includes(type_mouvement)) {
        await client.query(
          `UPDATE stocks SET
             quantite = quantite - $1,
             valeur_totale = MAX(0.0, valeur_totale - ($1 * cump)),
             updated_at = datetime('now')
           WHERE article_id = $2 AND magasin_id = $3`,
          [quantite, article_id, magasin_source_id]
        );

        if (type_mouvement === 'transfert') {
          const prixResult = await client.query(
            'SELECT cump FROM stocks WHERE article_id = $1 AND magasin_id = $2',
            [article_id, magasin_source_id]
          );
          const cump = prixResult.rows[0]?.cump || prix_unitaire;
          const valeurTransfert = parseFloat(quantite) * parseFloat(cump);
          await client.query(
            `INSERT OR IGNORE INTO stocks (article_id, magasin_id, quantite, cump, valeur_totale)
             VALUES ($1, $2, 0, 0, 0)`,
            [article_id, magasin_dest_id]
          );
          await client.query(
            `UPDATE stocks SET
               quantite = quantite + $3,
               valeur_totale = valeur_totale + $4,
               updated_at = datetime('now')
             WHERE article_id = $1 AND magasin_id = $2`,
            [article_id, magasin_dest_id, quantite, valeurTransfert]
          );
        }
      }

      // Enregistrer les mouvements (1 par lot affecté)
      let dernierMvResult = null;
      for (const item of lotsToDeduct) {
        const mvResult = await client.query(
          `INSERT INTO mouvements_stock
             (type_mouvement, article_id, lot_id, magasin_source_id, magasin_dest_id,
              quantite, prix_unitaire, valeur, reference_document, projet_id,
              destinataire, motif, saisi_par)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [type_mouvement, article_id, item.id, magasin_source_id, magasin_dest_id,
           item.qty, item.prix, item.qty * parseFloat(item.prix || 0),
           reference_document, projet_id, destinataire, motif, req.utilisateur.id]
        );
        dernierMvResult = mvResult.rows[0];

        // Mettre à jour la quantité du lot déduit
        if (['sortie', 'transfert', 'elimination'].includes(type_mouvement) && item.id) {
          await client.query(
            'UPDATE lots SET quantite = MAX(0.0, quantite - $1), updated_at = datetime(\'now\') WHERE id = $2',
            [item.qty, item.id]
          );
        }
      }

      return dernierMvResult;
    });

    return res.status(201).json({
      success: true,
      data: result,
      message: 'Mouvement enregistré avec succès'
    });
  } catch (err) {
    logger.error('Erreur mouvement stock:', err);
    if (err.message.includes('Stock insuffisant')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * GET /api/stocks/mouvements
 * Journal des mouvements de stock
 */
const journalMouvements = async (req, res) => {
  try {
    const { magasin_id, article_id, type_mouvement, date_debut, date_fin, page = 1, limite = 50 } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (magasin_id) { params.push(magasin_id); conditions.push(`(ms.magasin_source_id = $${params.length} OR ms.magasin_dest_id = $${params.length})`); }
    if (article_id) { params.push(article_id); conditions.push(`ms.article_id = $${params.length}`); }
    if (type_mouvement) { params.push(type_mouvement); conditions.push(`ms.type_mouvement = $${params.length}`); }
    if (date_debut) { params.push(date_debut); conditions.push(`ms.date_mouvement >= $${params.length}`); }
    if (date_fin) { params.push(date_fin + ' 23:59:59'); conditions.push(`ms.date_mouvement <= $${params.length}`); }

    const offset = (parseInt(page) - 1) * parseInt(limite);

    const [totalResult, result] = await Promise.all([
      query(`SELECT COUNT(*) FROM mouvements_stock ms WHERE ${conditions.join(' AND ')}`, params),
      query(
        `SELECT ms.*,
                a.designation AS article_designation, a.code AS article_code, a.unite_mesure,
                ms_src.nom AS magasin_source_nom, ms_dst.nom AS magasin_dest_nom,
                u.nom AS saisi_par_nom, u.prenom AS saisi_par_prenom,
                l.numero_lot
         FROM mouvements_stock ms
         JOIN articles a ON ms.article_id = a.id
         LEFT JOIN magasins ms_src ON ms.magasin_source_id = ms_src.id
         LEFT JOIN magasins ms_dst ON ms.magasin_dest_id = ms_dst.id
         LEFT JOIN utilisateurs u ON ms.saisi_par = u.id
         LEFT JOIN lots l ON ms.lot_id = l.id
         WHERE ${conditions.join(' AND ')}
         ORDER BY ms.date_mouvement DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limite), offset]
      )
    ]);

    return res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: parseInt(totalResult.rows[0].count),
        page: parseInt(page),
        limite: parseInt(limite)
      }
    });
  } catch (err) {
    logger.error('Erreur journal mouvements:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * GET /api/stocks/alertes
 * Liste des alertes de stock actives
 */
const alertes = async (req, res) => {
  try {
    const result = await query(
      `SELECT al.*,
              a.designation AS article_designation, a.code AS article_code,
              m.nom AS magasin_nom,
              l.numero_lot, l.date_peremption
       FROM alertes_stock al
       LEFT JOIN articles a ON al.article_id = a.id
       LEFT JOIN magasins m ON al.magasin_id = m.id
       LEFT JOIN lots l ON al.lot_id = l.id
       WHERE al.statut = 'active'
       ORDER BY al.created_at DESC`
    );

    return res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (err) {
    logger.error('Erreur alertes stock:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * POST /api/stocks/inventaires
 * Créer un nouvel inventaire
 */
const creerInventaire = async (req, res) => {
  try {
    const { magasin_id, type_inventaire } = req.body;

    // Générer numéro
    const count = await query("SELECT COUNT(*)+1 AS n FROM inventaires WHERE created_at >= date_trunc('year', NOW())");
    const numero = `INV-${new Date().getFullYear()}-${String(count.rows[0].n).padStart(4, '0')}`;

    const result = await transaction(async (client) => {
      const invResult = await client.query(
        `INSERT INTO inventaires (numero, magasin_id, type_inventaire, cree_par)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [numero, magasin_id, type_inventaire || 'cyclique', req.utilisateur.id]
      );

      // Pré-remplir les lignes avec stock théorique
      await client.query(
        `INSERT INTO inventaires_lignes (inventaire_id, article_id, lot_id, quantite_theorique)
         SELECT $1, l.article_id, l.id, l.quantite
         FROM lots l
         WHERE l.magasin_id = $2 AND l.statut = 'disponible' AND l.quantite > 0`,
        [invResult.rows[0].id, magasin_id]
      );

      return invResult.rows[0];
    });

    return res.status(201).json({ success: true, data: result, message: 'Inventaire créé' });
  } catch (err) {
    logger.error('Erreur création inventaire:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * GET /api/stocks/kpi
 * KPIs stocks pour le tableau de bord
 */
const kpi = async (req, res) => {
  try {
    const { magasin_id } = req.query;
    const condition = magasin_id ? `AND s.magasin_id = '${magasin_id}'` : '';

    const result = await query(`
      SELECT
        SUM(s.valeur_totale) AS valeur_totale_stock,
        COUNT(DISTINCT s.article_id) AS nb_references,
        COUNT(DISTINCT s.magasin_id) AS nb_magasins,
        COUNT(CASE WHEN s.quantite = 0 THEN 1 END) AS nb_ruptures,
        COUNT(CASE WHEN s.quantite <= s.stock_min AND s.stock_min > 0 THEN 1 END) AS nb_stock_min,
        (SELECT COUNT(*) FROM alertes_stock WHERE statut = 'active') AS nb_alertes_actives,
        (SELECT COUNT(*) FROM lots WHERE date_peremption <= NOW() + INTERVAL '6 months'
         AND statut = 'disponible') AS nb_lots_proches_peremption,
        (SELECT COUNT(*) FROM lots WHERE date_peremption < CURRENT_DATE AND statut != 'expire') AS nb_lots_expires
      FROM stocks s
      WHERE 1=1 ${condition}
    `);

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error('Erreur KPI stocks:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

/**
 * GET /api/stocks/prevision-achat
 * Calcul automatique des besoins d'achat
 */
const previsionAchat = async (req, res) => {
  try {
    const { magasin_id } = req.query;
    const condition = magasin_id ? `AND s.magasin_id = '${magasin_id}'` : '';

    const result = await query(`
      SELECT
        a.id, a.code, a.designation, a.unite_mesure,
        s.quantite AS stock_actuel,
        s.stock_min,
        s.stock_max,
        s.cump,
        -- CMM sur 3 mois
        COALESCE((
          SELECT SUM(ms.quantite) / 3
          FROM mouvements_stock ms
          WHERE ms.article_id = s.article_id
            AND ms.magasin_source_id = s.magasin_id
            AND ms.type_mouvement = 'sortie'
            AND ms.date_mouvement >= NOW() - INTERVAL '3 months'
        ), 0) AS cmm,
        MAX(0,
          s.stock_max - s.quantite - COALESCE((
            SELECT SUM(bcl.quantite_commandee - bcl.quantite_recue)
            FROM bons_commande_lignes bcl
            JOIN bons_commande bc ON bcl.commande_id = bc.id
            WHERE bcl.article_id = s.article_id
              AND bc.statut IN ('confirme', 'en_cours', 'livre_partiel')
          ), 0)
        ) AS quantite_a_commander,
        m.nom AS magasin_nom
      FROM stocks s
      JOIN articles a ON s.article_id = a.id
      JOIN magasins m ON s.magasin_id = m.id
      WHERE s.quantite <= s.stock_min ${condition}
      ORDER BY a.designation
    `);

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error('Erreur prévision achat:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

module.exports = {
  tableau, listerLots, enregistrerMouvement, journalMouvements,
  alertes, creerInventaire, kpi, previsionAchat
};
