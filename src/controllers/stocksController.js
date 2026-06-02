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

// ── Méthode FIFO/FEFO Automatique ──────────────────────────────────────

const sortieStockFIFO_FEFO = async (req, res) => {
  try {
    const { article_id, quantite_demandee, methode = 'FIFO', motif, destination_id } = req.body;
    const user_id = req.utilisateur.id;

    // Validation
    if (!['FIFO', 'FEFO'].includes(methode)) {
      return res.status(400).json({
        success: false,
        message: 'Méthode FIFO ou FEFO requise'
      });
    }

    if (quantite_demandee <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantité doit être > 0'
      });
    }

    // Récupérer les lots disponibles triés par date d'entrée ou péremption
    const order_by = methode === 'FIFO' ? 'date_entree ASC' : 'date_peremption ASC';

    const lots_disponibles = await query(
      `SELECT id, num_lot, quantite, date_entree, date_peremption, magasin_id, prix_unitaire
       FROM lots
       WHERE article_id = $1 AND quantite > 0 AND statut = 'disponible'
       ORDER BY ${order_by}`,
      [article_id]
    );

    if (lots_disponibles.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun lot disponible pour cet article'
      });
    }

    // Boucle: prélever dans chaque lot jusqu'à atteindre quantite_demandee
    const lots_utilises = [];
    let a_prelever = quantite_demandee;

    await transaction(async (client) => {
      for (let lot of lots_disponibles.rows) {
        if (a_prelever <= 0) break;

        const qt_prise = Math.min(lot.quantite, a_prelever);

        // Enregistrer le mouvement
        await client.query(
          `INSERT INTO mouvements_stock
           (article_id, lot_id, type_mouvement, quantite, magasin_source_id, motif, created_by)
           VALUES ($1, $2, 'sortie', $3, $4, $5, $6)`,
          [article_id, lot.id, qt_prise, lot.magasin_id, `${methode} - ${motif}`, user_id]
        );

        // Mettre à jour le lot
        await client.query(
          `UPDATE lots SET quantite = quantite - $1 WHERE id = $2`,
          [qt_prise, lot.id]
        );

        lots_utilises.push({
          lot_id: lot.id,
          lot_numero: lot.num_lot,
          quantite_prise: qt_prise,
          prix_unitaire: lot.prix_unitaire,
          montant: qt_prise * lot.prix_unitaire,
          date_peremption: lot.date_peremption
        });

        a_prelever -= qt_prise;
      }

      // Vérifier si on a prélevé la quantité demandée
      if (a_prelever > 0) {
        throw new Error(`Quantité insuffisante. Manque ${a_prelever} unité(s)`);
      }
    });

    // Calculer stats
    const montant_total = lots_utilises.reduce((sum, l) => sum + l.montant, 0);
    const prix_moyen = montant_total / quantite_demandee;

    logger.info(`Sortie ${methode}: ${quantite_demandee} de article ${article_id}`);

    return res.status(201).json({
      success: true,
      message: `Sortie enregistrée avec méthode ${methode}`,
      sortie: {
        article_id,
        quantite_demandee,
        quantite_prelevee: quantite_demandee - a_prelever,
        methode,
        lots_utilises,
        montant_total,
        prix_moyen_unitaire: prix_moyen.toFixed(2)
      }
    });
  } catch (error) {
    logger.error('Erreur sortie FIFO/FEFO:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la sortie de stock'
    });
  }
};

const analyserMethodePricing = async (req, res) => {
  try {
    const { article_id, quantite } = req.query;

    // Simulation FIFO vs FEFO vs CUMP
    const lots = await query(
      `SELECT id, num_lot, quantite, date_entree, date_peremption, prix_unitaire
       FROM lots
       WHERE article_id = $1 AND quantite > 0 AND statut = 'disponible'`,
      [article_id]
    );

    if (lots.rows.length === 0) {
      return res.json({
        success: false,
        message: 'Aucun lot disponible'
      });
    }

    // Calcul FIFO
    const fifo_lots = [...lots.rows].sort((a, b) =>
      new Date(a.date_entree) - new Date(b.date_entree)
    );

    // Calcul FEFO
    const fefo_lots = [...lots.rows].sort((a, b) =>
      new Date(a.date_peremption) - new Date(b.date_peremption)
    );

    // Calcul CUMP (Coût Unitaire Moyen Pondéré)
    const valeur_totale = lots.rows.reduce((sum, l) => sum + (l.quantite * l.prix_unitaire), 0);
    const quantite_totale = lots.rows.reduce((sum, l) => sum + l.quantite, 0);
    const prix_cump = valeur_totale / quantite_totale;

    const calculeMovement = (sorted_lots, qt, label) => {
      let a_prelever = qt;
      let montant = 0;
      const details = [];

      for (let lot of sorted_lots) {
        if (a_prelever <= 0) break;

        const qt_prise = Math.min(lot.quantite, a_prelever);
        montant += qt_prise * lot.prix_unitaire;

        details.push({
          lot: lot.num_lot,
          quantite: qt_prise,
          prix_unitaire: lot.prix_unitaire,
          montant: qt_prise * lot.prix_unitaire
        });

        a_prelever -= qt_prise;
      }

      return {
        methode: label,
        montant_total: montant,
        prix_moyen_unitaire: (montant / (qt - a_prelever)).toFixed(2),
        details
      };
    };

    const fifo = calculeMovement(fifo_lots, quantite, 'FIFO');
    const fefo = calculeMovement(fefo_lots, quantite, 'FEFO');
    const cump = {
      methode: 'CUMP',
      prix_unitaire: prix_cump.toFixed(2),
      montant_total: (quantite * prix_cump).toFixed(2),
      details: [{
        description: 'Moyenne pondérée tous lots',
        quantite,
        prix_unitaire: prix_cump.toFixed(2),
        montant: (quantite * prix_cump).toFixed(2)
      }]
    };

    return res.json({
      success: true,
      comparaison: {
        article_id,
        quantite,
        fifo,
        fefo,
        cump,
        difference_fifo_fefo: (fifo.montant_total - fefo.montant_total).toFixed(2),
        methode_recommandee: fifo.montant_total <= fefo.montant_total ? 'FIFO' : 'FEFO'
      }
    });
  } catch (error) {
    logger.error('Erreur analyse pricing:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'analyse'
    });
  }
};

// ── Alertes Stocks (Rupture + Péremption) ──────────────────────────────

const verifierAlertes = async (req, res) => {
  try {
    const { magasin_id } = req.query;

    // 1. Ruptures: quantité < seuil_minimum
    const ruptures = await query(
      `SELECT a.id, a.code, a.designation,
              s.quantite, s.stock_min, s.magasin_id,
              m.nom AS magasin_nom
       FROM stocks s
       JOIN articles a ON s.article_id = a.id
       JOIN magasins m ON s.magasin_id = m.id
       WHERE s.quantite < s.stock_min
         ${magasin_id ? 'AND s.magasin_id = $1' : ''}`
    );

    // 2. Péremption imminente: 30 jours avant expiration
    const peremptions = await query(
      `SELECT a.id, a.code, a.designation,
              l.num_lot, l.date_peremption, l.quantite,
              s.magasin_id, m.nom AS magasin_nom,
              EXTRACT(DAY FROM l.date_peremption - NOW()) AS jours_restants
       FROM lots l
       JOIN articles a ON l.article_id = a.id
       JOIN stocks s ON s.article_id = a.id
       JOIN magasins m ON s.magasin_id = m.id
       WHERE l.date_peremption <= NOW() + INTERVAL '30 days'
         AND l.date_peremption > NOW()
         AND l.quantite > 0
         AND l.statut = 'disponible'
         ${magasin_id ? 'AND s.magasin_id = $1' : ''}
       ORDER BY l.date_peremption ASC`
    );

    // 3. Stock max dépassé
    const stock_max = await query(
      `SELECT a.id, a.code, a.designation,
              s.quantite, s.stock_max, s.magasin_id,
              m.nom AS magasin_nom
       FROM stocks s
       JOIN articles a ON s.article_id = a.id
       JOIN magasins m ON s.magasin_id = m.id
       WHERE s.quantite > s.stock_max
         ${magasin_id ? 'AND s.magasin_id = $1' : ''}`
    );

    return res.json({
      success: true,
      alertes: {
        ruptures: ruptures.rows,
        peremptions: peremptions.rows,
        stock_max_depasse: stock_max.rows,
        nb_ruptures: ruptures.rows.length,
        nb_peremptions: peremptions.rows.length,
        nb_stock_max: stock_max.rows.length,
        total_alertes: ruptures.rows.length + peremptions.rows.length + stock_max.rows.length
      }
    });
  } catch (error) {
    logger.error('Erreur vérification alertes:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification des alertes'
    });
  }
};

const creerAlertesAutomatiques = async (req, res) => {
  try {
    const { magasin_id } = req.query;

    // Récupérer les ruptures
    const ruptures_result = await query(
      `SELECT a.id AS article_id, s.magasin_id, s.quantite, s.stock_min
       FROM stocks s
       JOIN articles a ON s.article_id = a.id
       WHERE s.quantite < s.stock_min
         AND NOT EXISTS (
           SELECT 1 FROM alertes_stock
           WHERE article_id = a.id
             AND magasin_id = s.magasin_id
             AND type_alerte = 'rupture'
             AND statut = 'active'
         )
         ${magasin_id ? `AND s.magasin_id = '${magasin_id}'` : ''}`
    );

    // Créer alerte pour chaque rupture
    for (let rupture of ruptures_result.rows) {
      await query(
        `INSERT INTO alertes_stock (type_alerte, article_id, magasin_id, message, statut)
         SELECT 'rupture', $1, $2,
                'Article ' || a.designation || ' en rupture de stock',
                'active'
         FROM articles a WHERE a.id = $1`,
        [rupture.article_id, rupture.magasin_id]
      );
    }

    // Récupérer les péremptions imminentes
    const peremptions_result = await query(
      `SELECT DISTINCT l.id AS lot_id, a.id AS article_id, s.magasin_id
       FROM lots l
       JOIN articles a ON l.article_id = a.id
       JOIN stocks s ON s.article_id = a.id
       WHERE l.date_peremption <= NOW() + INTERVAL '30 days'
         AND l.date_peremption > NOW()
         AND l.quantite > 0
         AND l.statut = 'disponible'
         AND NOT EXISTS (
           SELECT 1 FROM alertes_stock
           WHERE lot_id = l.id
             AND type_alerte = 'peremption'
             AND statut = 'active'
         )
         ${magasin_id ? `AND s.magasin_id = '${magasin_id}'` : ''}`
    );

    // Créer alerte pour chaque péremption
    for (let peremption of peremptions_result.rows) {
      const lot_info = await query(
        `SELECT a.designation, l.num_lot, l.date_peremption FROM lots l
         JOIN articles a ON l.article_id = a.id WHERE l.id = $1`,
        [peremption.lot_id]
      );

      const jours_restants = Math.ceil(
        (new Date(lot_info.rows[0].date_peremption) - new Date()) / (1000 * 60 * 60 * 24)
      );

      await query(
        `INSERT INTO alertes_stock (type_alerte, article_id, magasin_id, lot_id, message, statut)
         VALUES ('peremption', $1, $2, $3,
                 $4 || ' - Lot ' || $5 || ' expire dans ' || $6 || ' jours',
                 'active')`,
        [peremption.article_id, peremption.magasin_id, peremption.lot_id,
         lot_info.rows[0].designation, lot_info.rows[0].num_lot, jours_restants]
      );
    }

    logger.info(`Alertes créées: ${ruptures_result.rows.length} ruptures, ${peremptions_result.rows.length} péremptions`);

    return res.json({
      success: true,
      message: 'Alertes créées automatiquement',
      alertes_creees: {
        ruptures: ruptures_result.rows.length,
        peremptions: peremptions_result.rows.length
      }
    });
  } catch (error) {
    logger.error('Erreur création alertes automatiques:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la création des alertes'
    });
  }
};

const acquitterAlerte = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.utilisateur.id;

    const result = await query(
      `UPDATE alertes_stock
       SET statut = 'acquittee', acquittee_par = $1, date_acquittement = NOW()
       WHERE id = $2
       RETURNING *`,
      [user_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Alerte non trouvée' });
    }

    return res.json({
      success: true,
      alerte: result.rows[0],
      message: 'Alerte acquittée'
    });
  } catch (error) {
    logger.error('Erreur acquittement alerte:', error);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

// ── Gestion Non-conformités Réception ──────────────────────────────────

const enregistrerNonConformite = async (req, res) => {
  try {
    const { reception_id, type, description, quantite_affectee, photo_url, resolution_proposee } = req.body;
    const user_id = req.utilisateur.id;

    // Types acceptés: 'quantite_manquante', 'article_endommage', 'article_different', 'delai_depasse'
    const types_valides = ['quantite_manquante', 'article_endommage', 'article_different', 'delai_depasse'];
    if (!types_valides.includes(type)) {
      return res.status(400).json({ success: false, message: 'Type non-conformité invalide' });
    }

    const result = await query(
      `INSERT INTO non_conformites
       (reception_id, type, description, quantite_affectee, photo_url, statut, resolution_proposee, created_by)
       VALUES ($1, $2, $3, $4, $5, 'ouverte', $6, $7)
       RETURNING *`,
      [reception_id, type, description, quantite_affectee, photo_url, resolution_proposee, user_id]
    );

    const nc = result.rows[0];
    logger.info(`Non-conformité enregistrée: ${nc.id}`);

    // Notifier responsable achats
    // TODO: Implémentation notification email/dashboard

    return res.status(201).json({
      success: true,
      nonConformite: nc,
      message: 'Non-conformité enregistrée avec succès'
    });
  } catch (error) {
    logger.error('Erreur enregistrement non-conformité:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'enregistrement',
      error: error.message
    });
  }
};

const listerNonConformites = async (req, res) => {
  try {
    const { reception_id, statut, page = 1, limite = 25 } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (reception_id) {
      params.push(reception_id);
      conditions.push(`nc.reception_id = $${params.length}`);
    }
    if (statut) {
      params.push(statut);
      conditions.push(`nc.statut = $${params.length}`);
    }

    const offset = (parseInt(page) - 1) * parseInt(limite);
    const where = conditions.join(' AND ');

    const [total, ncs] = await Promise.all([
      query(`SELECT COUNT(*) FROM non_conformites nc WHERE ${where}`, params),
      query(
        `SELECT nc.*, u.nom AS createur_nom, u.prenom AS createur_prenom,
                r.numero AS reception_numero
         FROM non_conformites nc
         LEFT JOIN utilisateurs u ON nc.created_by = u.id
         LEFT JOIN receptions r ON nc.reception_id = r.id
         WHERE ${where}
         ORDER BY nc.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limite), offset]
      )
    ]);

    return res.json({
      success: true,
      pagination: {
        page: parseInt(page),
        limite: parseInt(limite),
        total: parseInt(total.rows[0].count)
      },
      nonConformites: ncs.rows
    });
  } catch (error) {
    logger.error('Erreur listing non-conformités:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des non-conformités'
    });
  }
};

const resoudreNonConformite = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution, notes, photo_avant_apres_url } = req.body;
    const user_id = req.utilisateur.id;

    const result = await query(
      `UPDATE non_conformites
       SET statut = 'resolue',
           resolution_proposee = $1,
           notes = $2,
           photo_url = COALESCE($3, photo_url),
           resolue_le = NOW(),
           resolve_par = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [resolution, notes, photo_avant_apres_url, user_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Non-conformité non trouvée'
      });
    }

    logger.info(`Non-conformité résolue: ${id}`);
    return res.json({
      success: true,
      nonConformite: result.rows[0],
      message: 'Non-conformité résolue'
    });
  } catch (error) {
    logger.error('Erreur résolution non-conformité:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la résolution'
    });
  }
};

const historiqueBonReception = async (req, res) => {
  try {
    const { reception_id } = req.params;

    const result = await query(
      `SELECT nc.*, u.nom, u.prenom
       FROM non_conformites nc
       LEFT JOIN utilisateurs u ON nc.created_by = u.id
       WHERE nc.reception_id = $1
       ORDER BY nc.created_at DESC`,
      [reception_id]
    );

    return res.json({
      success: true,
      historique: result.rows
    });
  } catch (error) {
    logger.error('Erreur historique bon réception:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'historique'
    });
  }
};

module.exports = {
  tableau, listerLots, enregistrerMouvement, journalMouvements,
  alertes, creerInventaire, kpi, previsionAchat,
  sortieStockFIFO_FEFO, analyserMethodePricing,
  verifierAlertes, creerAlertesAutomatiques, acquitterAlerte,
  enregistrerNonConformite, listerNonConformites, resoudreNonConformite, historiqueBonReception
};
