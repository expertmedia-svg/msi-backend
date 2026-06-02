// src/controllers/integrationController.js
// Connecteurs API natifs : SUN / CLIC+ / ORION / MATE

const { query, saveDatabase } = require('../config/database');
const logger = require('../config/logger');
const ExcelJS = require('exceljs');
const { v4: uuidv4 } = require('uuid');

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function logSync(system_code, statut, nb, message, duree_ms, user_id, declencheur = 'manuel') {
  try {
    await query(
      `INSERT INTO integrations_logs (id, system_code, statut, nb_enregistrements, message, duree_ms, declencheur, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), system_code, statut, nb, message, duree_ms, declencheur, user_id || null]
    );
    await query(
      `UPDATE integrations_config
         SET dernier_sync = CURRENT_TIMESTAMP,
             dernier_statut = ?,
             dernier_message = ?,
             nb_syncs_ok = nb_syncs_ok + ?,
             nb_syncs_erreur = nb_syncs_erreur + ?,
             updated_at = CURRENT_TIMESTAMP
       WHERE system_code = ?`,
      [statut, message, statut === 'succes' ? 1 : 0, statut === 'erreur' ? 1 : 0, system_code]
    );
    saveDatabase();
  } catch (e) {
    logger.error('Erreur log sync:', e.message);
  }
}

async function callExternalApi(config, path, payload) {
  if (!config.api_url || !config.api_key) {
    throw new Error(`Système ${config.system_code} non configuré (URL ou clé API manquante)`);
  }
  const url = `${config.api_url.replace(/\/$/, '')}${path}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.api_key}`,
      'X-MSI-Source': 'MSI-BF-GESTION',
      'X-MSI-Version': '1.0',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${body.substring(0, 200)}`);
  }
  return resp.json().catch(() => ({ success: true }));
}

// ─── CONTROLLERS ──────────────────────────────────────────────────────────────

/**
 * GET /api/integration/configs
 * Lister toutes les configs d'intégration
 */
const getConfigs = async (req, res) => {
  const r = await query(
    `SELECT system_code, system_nom, description, api_url,
            CASE WHEN api_key IS NOT NULL AND api_key != '' THEN '***configurée***' ELSE NULL END AS api_key_hint,
            webhook_url, statut, actif, dernier_sync, dernier_statut, dernier_message,
            nb_syncs_ok, nb_syncs_erreur, format_export, updated_at
     FROM integrations_config ORDER BY system_code`
  );
  return res.json({ success: true, data: r.rows });
};

/**
 * PUT /api/integration/configs/:code
 * Mettre à jour la config d'un système
 */
const updateConfig = async (req, res) => {
  const { code } = req.params;
  const { api_url, api_key, webhook_url, actif } = req.body;

  const existing = await query(
    'SELECT id FROM integrations_config WHERE system_code = ?', [code.toUpperCase()]
  );
  if (!existing.rows.length) {
    return res.status(404).json({ success: false, message: 'Système non trouvé' });
  }

  const fields = [];
  const vals = [];

  if (api_url !== undefined) { fields.push('api_url = ?'); vals.push(api_url || null); }
  if (api_key !== undefined && api_key !== '***configurée***') { fields.push('api_key = ?'); vals.push(api_key || null); }
  if (webhook_url !== undefined) { fields.push('webhook_url = ?'); vals.push(webhook_url || null); }
  if (actif !== undefined) { fields.push('actif = ?'); vals.push(actif ? 1 : 0); }

  const hasUrl = api_url && api_url.trim() !== '';
  const checkKey = await query('SELECT api_key FROM integrations_config WHERE system_code = ?', [code.toUpperCase()]);
  const hasKey = (api_key && api_key !== '***configurée***' && api_key.trim() !== '') ||
    (checkKey.rows[0]?.api_key && checkKey.rows[0].api_key.trim() !== '');

  const newStatut = hasUrl && hasKey ? 'configure' : 'non_configure';
  fields.push('statut = ?'); vals.push(newStatut);
  fields.push('updated_at = CURRENT_TIMESTAMP');

  vals.push(code.toUpperCase());
  await query(`UPDATE integrations_config SET ${fields.join(', ')} WHERE system_code = ?`, vals);
  saveDatabase();

  return res.json({ success: true, message: `Configuration ${code} mise à jour`, statut: newStatut });
};

/**
 * POST /api/integration/test/:code
 * Tester la connexion à un système externe
 */
const testConnection = async (req, res) => {
  const { code } = req.params;
  const start = Date.now();

  const cfg = await query(
    'SELECT * FROM integrations_config WHERE system_code = ?', [code.toUpperCase()]
  );
  if (!cfg.rows.length) {
    return res.status(404).json({ success: false, message: 'Système non trouvé' });
  }
  const config = cfg.rows[0];

  if (!config.api_url || !config.api_key) {
    return res.status(400).json({
      success: false,
      message: `Système ${code} non configuré. Renseignez l'URL API et la clé API.`
    });
  }

  try {
    await callExternalApi(config, '/ping', { source: 'MSI-BF', timestamp: new Date().toISOString() });
    const duree = Date.now() - start;
    await logSync(code.toUpperCase(), 'succes', 0, `Connexion OK (${duree}ms)`, duree, req.user?.id, 'test');
    return res.json({ success: true, message: `Connexion ${code} établie avec succès (${duree}ms)`, duree_ms: duree });
  } catch (err) {
    const duree = Date.now() - start;
    await logSync(code.toUpperCase(), 'erreur', 0, err.message, duree, req.user?.id, 'test');
    return res.status(502).json({ success: false, message: `Connexion échouée : ${err.message}`, duree_ms: duree });
  }
};

/**
 * POST /api/integration/sync/sun
 * Synchroniser les données vers SUN Systems (Finance)
 * Exporte : valorisation stock, engagements achats, immobilisations
 */
const syncSun = async (req, res) => {
  const start = Date.now();
  const cfg = (await query('SELECT * FROM integrations_config WHERE system_code = ?', ['SUN'])).rows[0];

  try {
    // 1. Valorisation stock
    const stocks = await query(`
      SELECT a.code AS article_code, a.designation, s.quantite, s.cump,
             s.valeur_totale, m.nom AS magasin, a.categorie
      FROM stocks s
      JOIN articles a ON s.article_id = a.id
      JOIN magasins m ON s.magasin_id = m.id
      WHERE s.quantite > 0
      ORDER BY a.code
    `);

    // 2. Engagements achats (BC validés)
    const achats = await query(`
      SELECT bc.numero, bc.date_commande, bc.montant_ttc, bc.statut,
             f.nom AS fournisseur, p.code AS projet_code
      FROM bons_commande bc
      LEFT JOIN fournisseurs f ON bc.fournisseur_id = f.id
      LEFT JOIN projets p ON bc.projet_id = p.id
      WHERE bc.statut IN ('valide', 'expedie', 'partiellement_recu')
    `);

    // 3. Immobilisations équipements
    const equipements = await query(`
      SELECT e.code_etiquette, e.designation, e.valeur_achat,
             e.date_acquisition, e.statut, ce.libelle AS categorie
      FROM equipements e
      LEFT JOIN categories_equipement ce ON e.categorie_id = ce.id
      WHERE e.statut != 'sorti'
    `);

    const payload = {
      source: 'MSI-BF-GESTION',
      date_export: new Date().toISOString(),
      exercice: new Date().getFullYear(),
      stocks: stocks.rows,
      engagements_achats: achats.rows,
      immobilisations: equipements.rows,
    };

    // Si API configurée : envoi réel, sinon : génère Excel de démonstration
    let message;
    let nb = stocks.rows.length + achats.rows.length + equipements.rows.length;

    if (cfg?.api_url && cfg?.api_key) {
      await callExternalApi(cfg, '/api/v1/msi/import', payload);
      message = `${nb} enregistrements transmis à SUN (${stocks.rows.length} stocks, ${achats.rows.length} achats, ${equipements.rows.length} équipements)`;
    } else {
      // Mode démo : génère un Excel SUN
      message = `[DÉMO] Payload SUN prêt – ${nb} enregistrements. Configurez l'URL API pour l'envoi réel.`;
    }

    const duree = Date.now() - start;
    await logSync('SUN', 'succes', nb, message, duree, req.user?.id);
    return res.json({ success: true, message, nb_enregistrements: nb, duree_ms: duree, payload_apercu: { stocks: stocks.rows.length, achats: achats.rows.length, equipements: equipements.rows.length } });
  } catch (err) {
    const duree = Date.now() - start;
    await logSync('SUN', 'erreur', 0, err.message, duree, req.user?.id);
    logger.error('Erreur sync SUN:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/integration/sync/clic-plus
 * Synchroniser les mouvements de stock vers CLIC+
 */
const syncClicPlus = async (req, res) => {
  const start = Date.now();
  const cfg = (await query('SELECT * FROM integrations_config WHERE system_code = ?', ['CLIC_PLUS'])).rows[0];

  try {
    const mouvements = await query(`
      SELECT ms.type_mouvement, ms.quantite, ms.date_mouvement,
             a.code AS article_code, a.designation,
             a.unite_mesure,
             l.numero_lot, l.date_peremption,
             m.nom AS magasin,
             p.code AS projet_code,
             u.nom || ' ' || u.prenom AS operateur
      FROM mouvements_stock ms
      JOIN articles a ON ms.article_id = a.id
      JOIN magasins m ON ms.magasin_id = m.id
      LEFT JOIN lots l ON ms.lot_id = l.id
      LEFT JOIN projets p ON ms.projet_id = p.id
      LEFT JOIN utilisateurs u ON ms.created_by = u.id
      WHERE ms.date_mouvement >= date('now', '-30 days')
      ORDER BY ms.date_mouvement DESC
    `);

    const payload = {
      source: 'MSI-BF',
      country_code: 'BF',
      period: 'last_30_days',
      date_export: new Date().toISOString(),
      mouvements: mouvements.rows,
    };

    let nb = mouvements.rows.length;
    let message;

    if (cfg?.api_url && cfg?.api_key) {
      await callExternalApi(cfg, '/api/movements/import', payload);
      message = `${nb} mouvements de stock transmis à CLIC+`;
    } else {
      message = `[DÉMO] Payload CLIC+ prêt – ${nb} mouvements (30 derniers jours). Configurez l'URL API pour l'envoi réel.`;
    }

    const duree = Date.now() - start;
    await logSync('CLIC_PLUS', 'succes', nb, message, duree, req.user?.id);
    return res.json({ success: true, message, nb_enregistrements: nb, duree_ms: duree });
  } catch (err) {
    const duree = Date.now() - start;
    await logSync('CLIC_PLUS', 'erreur', 0, err.message, duree, req.user?.id);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/integration/sync/orion
 * Synchroniser les affectations équipements vers ORION (RH & Actifs)
 */
const syncOrion = async (req, res) => {
  const start = Date.now();
  const cfg = (await query('SELECT * FROM integrations_config WHERE system_code = ?', ['ORION'])).rows[0];

  try {
    const affectations = await query(`
      SELECT e.code_etiquette, e.designation, e.marque, e.modele,
             e.numero_serie, e.valeur_achat, e.statut,
             ce.libelle AS categorie,
             u.nom AS agent_nom, u.prenom AS agent_prenom, u.email AS agent_email,
             r.libelle AS role_agent,
             s.nom AS site,
             ea.date_affectation, ea.statut AS statut_affectation
      FROM equipements e
      LEFT JOIN categories_equipement ce ON e.categorie_id = ce.id
      LEFT JOIN equipements_affectations ea ON ea.equipement_id = e.id AND ea.statut = 'actif'
      LEFT JOIN utilisateurs u ON ea.utilisateur_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN sites s ON e.site_id = s.id
      WHERE e.statut != 'sorti'
      ORDER BY e.code_etiquette
    `);

    const payload = {
      source: 'MSI-BF',
      country_code: 'BF',
      date_export: new Date().toISOString(),
      assets: affectations.rows,
    };

    let nb = affectations.rows.length;
    let message;

    if (cfg?.api_url && cfg?.api_key) {
      await callExternalApi(cfg, '/api/assets/sync', payload);
      message = `${nb} équipements synchronisés vers ORION`;
    } else {
      message = `[DÉMO] Payload ORION prêt – ${nb} équipements avec affectations. Configurez l'URL API pour l'envoi réel.`;
    }

    const duree = Date.now() - start;
    await logSync('ORION', 'succes', nb, message, duree, req.user?.id);
    return res.json({ success: true, message, nb_enregistrements: nb, duree_ms: duree });
  } catch (err) {
    const duree = Date.now() - start;
    await logSync('ORION', 'erreur', 0, err.message, duree, req.user?.id);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/integration/sync/mate
 * Synchroniser les données flotte vers MATE
 */
const syncMate = async (req, res) => {
  const start = Date.now();
  const cfg = (await query('SELECT * FROM integrations_config WHERE system_code = ?', ['MATE'])).rows[0];

  try {
    const missions = await query(`
      SELECT m.id, m.date_debut, m.date_fin, m.km_depart, m.km_retour,
             m.statut, m.rapport_mission,
             v.immatriculation, v.type_vehicule,
             e.designation AS vehicule_nom,
             u.nom || ' ' || u.prenom AS conducteur
      FROM missions m
      JOIN vehicules v ON m.vehicule_id = v.id
      JOIN equipements e ON v.equipement_id = e.id
      LEFT JOIN utilisateurs u ON m.conducteur_id = u.id
      WHERE m.date_debut >= date('now', '-30 days')
      ORDER BY m.date_debut DESC
    `);

    const carburant = await query(`
      SELECT ac.date_approvisionnement, ac.quantite_litres, ac.montant_total,
             ac.km_compteur, v.immatriculation,
             u.nom || ' ' || u.prenom AS operateur
      FROM approvisionnements_carburant ac
      JOIN vehicules v ON ac.vehicule_id = v.id
      LEFT JOIN utilisateurs u ON ac.created_by = u.id
      WHERE ac.date_approvisionnement >= date('now', '-30 days')
    `);

    const payload = {
      source: 'MSI-BF',
      country_code: 'BF',
      period: 'last_30_days',
      date_export: new Date().toISOString(),
      missions: missions.rows,
      approvisionnements_carburant: carburant.rows,
    };

    let nb = missions.rows.length + carburant.rows.length;
    let message;

    if (cfg?.api_url && cfg?.api_key) {
      await callExternalApi(cfg, '/api/fleet/sync', payload);
      message = `${nb} enregistrements transmis à MATE (${missions.rows.length} missions, ${carburant.rows.length} appro. carburant)`;
    } else {
      message = `[DÉMO] Payload MATE prêt – ${nb} enregistrements. Configurez l'URL API pour l'envoi réel.`;
    }

    const duree = Date.now() - start;
    await logSync('MATE', 'succes', nb, message, duree, req.user?.id);
    return res.json({ success: true, message, nb_enregistrements: nb, duree_ms: duree });
  } catch (err) {
    const duree = Date.now() - start;
    await logSync('MATE', 'erreur', 0, err.message, duree, req.user?.id);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/integration/logs
 * Historique des synchronisations
 */
const getLogs = async (req, res) => {
  const { system_code, limit = 50 } = req.query;
  const conditions = system_code ? `WHERE system_code = '${system_code.toUpperCase()}'` : '';
  const r = await query(
    `SELECT * FROM integrations_logs ${conditions} ORDER BY created_at DESC LIMIT ?`,
    [parseInt(limit)]
  );
  return res.json({ success: true, data: r.rows });
};

/**
 * POST /api/integration/sync/sun/excel
 * Télécharger le fichier Excel de triangulation SUN
 */
const exportSunExcel = async (req, res) => {
  const stocks = await query(`
    SELECT a.code, a.designation, a.unite_mesure, m.nom AS magasin,
           s.quantite, s.cump, s.valeur_totale,
           CASE WHEN s.quantite = 0 THEN 'RUPTURE'
                WHEN s.quantite <= s.stock_min THEN 'ALERTE'
                ELSE 'NORMAL' END AS statut
    FROM stocks s
    JOIN articles a ON s.article_id = a.id
    JOIN magasins m ON s.magasin_id = m.id
    ORDER BY m.nom, a.designation
  `);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MSI BF – Connecteur SUN';

  const ws = wb.addWorksheet('SUN_STOCK_EXPORT');
  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = `MSI BURKINA FASO – EXPORT SUN SYSTEMS – ${new Date().toLocaleDateString('fr-FR')}`;
  ws.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B5E20' } };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.addRow([]);

  const hdrs = ['Code Article', 'Désignation', 'Unité', 'Magasin', 'Quantité', 'CUMP (FCFA)', 'Valeur Totale (FCFA)', 'Statut'];
  const hr = ws.addRow(hdrs);
  hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };

  stocks.rows.forEach(r => {
    const row = ws.addRow([r.code, r.designation, r.unite_mesure, r.magasin, r.quantite, r.cump, r.valeur_totale, r.statut]);
    if (r.statut === 'RUPTURE') row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCDD2' } };
    else if (r.statut === 'ALERTE') row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
  });

  ws.columns.forEach(c => { c.width = 22; });
  ws.autoFilter = 'A3:H3';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=MSI_SUN_export_${new Date().toISOString().slice(0,10)}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
};

module.exports = {
  getConfigs, updateConfig, testConnection,
  syncSun, syncClicPlus, syncOrion, syncMate,
  getLogs, exportSunExcel,
};
