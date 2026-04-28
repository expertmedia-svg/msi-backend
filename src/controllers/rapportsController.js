// src/controllers/rapportsController.js
// Génération de rapports Excel et PDF

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { query } = require('../config/database');
const logger = require('../config/logger');

/**
 * GET /api/rapports/stocks/excel
 * Export Excel du stock compatible SUN
 */
const exportStocksExcel = async (req, res) => {
  try {
    const { magasin_id } = req.query;
    const condition = magasin_id ? `AND s.magasin_id = '${magasin_id}'` : '';

    const result = await query(`
      SELECT
        a.code AS "Code Article",
        a.designation AS "Désignation",
        a.unite_mesure AS "Unité",
        m.nom AS "Magasin",
        s.quantite AS "Quantité en Stock",
        s.cump AS "CUMP (FCFA)",
        s.valeur_totale AS "Valeur Totale (FCFA)",
        s.stock_min AS "Stock Minimum",
        s.stock_max AS "Stock Maximum",
        s.cmm AS "CMM",
        CASE WHEN s.quantite = 0 THEN 'RUPTURE'
             WHEN s.quantite <= s.stock_min THEN 'STOCK MIN ATTEINT'
             ELSE 'NORMAL'
        END AS "Statut"
      FROM stocks s
      JOIN articles a ON s.article_id = a.id
      JOIN magasins m ON s.magasin_id = m.id
      WHERE 1=1 ${condition}
      ORDER BY m.nom, a.designation
    `);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MSI Burkina Faso - Système de Gestion';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Stock Actuel', {
      pageSetup: { paperSize: 9, orientation: 'landscape' }
    });

    // En-tête MSI
    worksheet.mergeCells('A1:M1');
    worksheet.getCell('A1').value = 'MSI BURKINA FASO - ÉTAT DU STOCK';
    worksheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B5E20' } };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    worksheet.mergeCells('A2:M2');
    worksheet.getCell('A2').value = `Édité le : ${new Date().toLocaleString('fr-FR')}`;
    worksheet.getCell('A2').alignment = { horizontal: 'right' };
    worksheet.addRow([]);

    // En-têtes colonnes
    if (result.rows.length > 0) {
      const headers = Object.keys(result.rows[0]);
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
      headerRow.alignment = { horizontal: 'center' };

      // Données
      result.rows.forEach(row => {
        const dataRow = worksheet.addRow(Object.values(row));
        // Colorier les lignes d'alerte
        if (row['Statut'] === 'RUPTURE') {
          dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCDD2' } };
        } else if (row['Statut'] === 'STOCK MIN ATTEINT') {
          dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
        }
      });

      // Autofilter
      worksheet.autoFilter = { from: 'A4', to: `${String.fromCharCode(64 + headers.length)}4` };

      // Largeur auto
      worksheet.columns.forEach(col => { col.width = 20; });
    }

    // Onglet récapitulatif
    const resumeSheet = workbook.addWorksheet('Résumé');
    const kpiResult = await query(`
      SELECT
        COUNT(DISTINCT s.article_id) AS nb_references,
        COUNT(DISTINCT s.magasin_id) AS nb_magasins,
        SUM(s.valeur_totale) AS valeur_totale,
        COUNT(CASE WHEN s.quantite = 0 THEN 1 END) AS ruptures,
        COUNT(CASE WHEN s.quantite <= s.stock_min AND s.stock_min > 0 THEN 1 END) AS alertes_stock_min
      FROM stocks s
    `);

    resumeSheet.addRow(['RÉSUMÉ STOCK']);
    resumeSheet.addRow(['Nombre de références', kpiResult.rows[0].nb_references]);
    resumeSheet.addRow(['Nombre de magasins', kpiResult.rows[0].nb_magasins]);
    resumeSheet.addRow(['Valeur totale (FCFA)', parseFloat(kpiResult.rows[0].valeur_totale || 0).toLocaleString('fr-FR')]);
    resumeSheet.addRow(['Ruptures de stock', kpiResult.rows[0].ruptures]);
    resumeSheet.addRow(['Articles en stock minimum', kpiResult.rows[0].alertes_stock_min]);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=stock_${new Date().toISOString().slice(0,10)}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error('Erreur export stocks Excel:', err);
    return res.status(500).json({ success: false, message: 'Erreur génération rapport' });
  }
};

/**
 * GET /api/rapports/achats/excel
 * Export Excel des bons de commande
 */
const exportAchatsExcel = async (req, res) => {
  try {
    const { date_debut, date_fin, fournisseur_id, projet_id } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (date_debut) { params.push(date_debut); conditions.push(`bc.date_commande >= $${params.length}`); }
    if (date_fin) { params.push(date_fin); conditions.push(`bc.date_commande <= $${params.length}`); }
    if (fournisseur_id) { params.push(fournisseur_id); conditions.push(`bc.fournisseur_id = $${params.length}`); }
    if (projet_id) { params.push(projet_id); conditions.push(`bc.projet_id = $${params.length}`); }

    const result = await query(
      `SELECT
         bc.numero AS "N° Commande",
         bc.date_commande AS "Date",
         f.nom AS "Fournisseur",
         p.nom AS "Projet",
         bc.montant_ht AS "Montant HT (FCFA)",
         bc.montant_ttc AS "Montant TTC (FCFA)",
         bc.statut AS "Statut",
         bc.date_livraison_prevue AS "Livraison Prévue",
         u.nom || ' ' || u.prenom AS "Créé par"
       FROM bons_commande bc
       LEFT JOIN fournisseurs f ON bc.fournisseur_id = f.id
       LEFT JOIN projets p ON bc.projet_id = p.id
       LEFT JOIN utilisateurs u ON bc.created_by = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY bc.date_commande DESC`,
      params
    );

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Commandes');

    ws.columns = [
      { key: 'N° Commande', width: 18 }, { key: 'Date', width: 14 },
      { key: 'Fournisseur', width: 30 }, { key: 'Projet', width: 25 },
      { key: 'Montant HT (FCFA)', width: 20 }, { key: 'Montant TTC (FCFA)', width: 20 },
      { key: 'Statut', width: 15 }, { key: 'Livraison Prévue', width: 18 },
      { key: 'Créé par', width: 25 }
    ];

    const headerRow = ws.addRow(ws.columns.map(c => c.key));
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } };

    result.rows.forEach(row => ws.addRow(Object.values(row)));

    const total = result.rows.reduce((s, r) => s + parseFloat(r['Montant HT (FCFA)'] || 0), 0);
    ws.addRow([]);
    const totalRow = ws.addRow(['', '', '', 'TOTAL', total, total]);
    totalRow.font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=commandes_${new Date().toISOString().slice(0,10)}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error('Erreur export achats:', err);
    return res.status(500).json({ success: false, message: 'Erreur génération rapport' });
  }
};

/**
 * GET /api/rapports/flotte/excel
 * Export Excel consommation carburant par véhicule
 */
const exportFlotteExcel = async (req, res) => {
  try {
    const { annee } = req.query;
    const exercice = annee || new Date().getFullYear();

    const result = await query(
      `SELECT
         v.immatriculation AS "Immatriculation",
         e.designation AS "Désignation",
         v.type_vehicule AS "Type",
         COALESCE(SUM(ac.quantite_litres), 0) AS "Total Litres",
         COALESCE(SUM(ac.montant_total), 0) AS "Coût Carburant (FCFA)",
         COALESCE(SUM(m.montant), 0) AS "Coût Maintenance (FCFA)",
         COALESCE(SUM(ac.montant_total), 0) + COALESCE(SUM(m.montant), 0) AS "Coût Total (FCFA)",
         v.kilometrage_actuel - v.kilometrage_initial AS "KM Parcourus"
       FROM vehicules v
       JOIN equipements e ON v.equipement_id = e.id
       LEFT JOIN approvisionnements_carburant ac ON ac.vehicule_id = v.id
         AND EXTRACT(YEAR FROM ac.date_approvisionnement) = $1
       LEFT JOIN maintenances m ON m.vehicule_id = v.id
         AND EXTRACT(YEAR FROM m.date_realisation) = $1
       WHERE v.actif = TRUE
       GROUP BY v.id, e.designation
       ORDER BY v.immatriculation`,
      [exercice]
    );

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet(`Flotte ${exercice}`);

    ws.mergeCells('A1:H1');
    ws.getCell('A1').value = `MSI BF - TABLEAU DE BORD FLOTTE ${exercice}`;
    ws.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB71C1C' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    const headers = Object.keys(result.rows[0] || {});
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCDD2' } };

    result.rows.forEach(row => ws.addRow(Object.values(row)));
    ws.columns.forEach(c => { c.width = 22; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=flotte_${exercice}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error('Erreur export flotte:', err);
    return res.status(500).json({ success: false, message: 'Erreur génération rapport' });
  }
};

/**
 * GET /api/rapports/equipements/pdf
 * Liste valorisée des équipements en PDF
 */
const exportEquipementsPDF = async (req, res) => {
  try {
    const result = await query(
      `SELECT e.code_etiquette, e.designation, ce.libelle AS categorie,
              e.marque, e.modele, e.date_acquisition,
              e.valeur_achat, e.statut, s.nom AS site,
              u.nom || ' ' || u.prenom AS affecte_a
       FROM equipements e
       LEFT JOIN categories_equipement ce ON e.categorie_id = ce.id
       LEFT JOIN sites s ON e.site_id = s.id
       LEFT JOIN equipements_affectations ea ON ea.equipement_id = e.id AND ea.statut = 'actif'
       LEFT JOIN utilisateurs u ON ea.utilisateur_id = u.id
       WHERE e.statut != 'sorti'
       ORDER BY ce.libelle, e.designation`
    );

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=equipements_${new Date().toISOString().slice(0,10)}.pdf`);
    doc.pipe(res);

    // En-tête
    doc.fontSize(16).fillColor('#1B5E20').text('MSI BURKINA FASO', { align: 'center' });
    doc.fontSize(12).fillColor('#333').text('LISTE VALORISÉE DES ÉQUIPEMENTS', { align: 'center' });
    doc.fontSize(9).text(`Édité le ${new Date().toLocaleString('fr-FR')}`, { align: 'right' });
    doc.moveDown();

    // Tableau
    const cols = [60, 140, 70, 60, 50, 70, 70, 55, 80, 80];
    const headers = ['Code', 'Désignation', 'Catégorie', 'Marque', 'Modèle', 'Acquisition', 'Valeur (FCFA)', 'Statut', 'Site', 'Affecté à'];
    let y = doc.y;

    // En-têtes
    doc.rect(40, y, 760, 20).fill('#2E7D32');
    let x = 40;
    headers.forEach((h, i) => {
      doc.fillColor('white').fontSize(8).text(h, x + 2, y + 4, { width: cols[i] - 4, ellipsis: true });
      x += cols[i];
    });
    y += 22;

    // Lignes
    result.rows.forEach((row, idx) => {
      if (y > 520) { doc.addPage(); y = 40; }
      if (idx % 2 === 0) doc.rect(40, y, 760, 16).fill('#F1F8E9');
      x = 40;
      const vals = [
        row.code_etiquette, row.designation, row.categorie || '',
        row.marque || '', row.modele || '',
        row.date_acquisition ? new Date(row.date_acquisition).toLocaleDateString('fr-FR') : '',
        row.valeur_achat ? parseFloat(row.valeur_achat).toLocaleString('fr-FR') : '',
        row.statut, row.site || '', row.affecte_a || ''
      ];
      vals.forEach((v, i) => {
        doc.fillColor('#333').fontSize(7).text(String(v || ''), x + 2, y + 3, { width: cols[i] - 4, ellipsis: true });
        x += cols[i];
      });
      y += 18;
    });

    // Total
    const total = result.rows.reduce((s, r) => s + parseFloat(r.valeur_achat || 0), 0);
    doc.moveDown().fontSize(10).fillColor('#1B5E20')
       .text(`Total valorisé : ${total.toLocaleString('fr-FR')} FCFA`, { align: 'right' });

    doc.end();
  } catch (err) {
    logger.error('Erreur export PDF équipements:', err);
    return res.status(500).json({ success: false, message: 'Erreur génération PDF' });
  }
};

module.exports = { exportStocksExcel, exportAchatsExcel, exportFlotteExcel, exportEquipementsPDF };
