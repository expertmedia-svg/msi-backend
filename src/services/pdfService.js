// src/services/pdfService.js
// Service de génération PDF pour rapports audit-ready

const PDFDocument = require('pdfkit');
const { query } = require('../config/database');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');

// Répertoire pour stocker les PDFs temporaires
const pdfDir = path.join(__dirname, '../../uploads/pdfs');
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
}

// ── Rapport Audit Justificatifs ────────────────────────────────────────

const genererRapportAuditJustificatifs = async (bailleur_code, date_debut, date_fin) => {
  try {
    // Récupérer les justificatifs du bailleur dans la période
    const justificatifs = await query(
      `SELECT j.*, u.nom AS validateur_nom, u.prenom AS validateur_prenom
       FROM justificatifs j
       LEFT JOIN utilisateurs u ON j.valide_par = u.id
       WHERE j.bailleur_code = $1
         AND j.date >= $2
         AND j.date <= $3
       ORDER BY j.date ASC`,
      [bailleur_code, date_debut, date_fin]
    );

    // Récupérer info bailleur
    const bailleur_info = await query(
      `SELECT * FROM bailleurs WHERE code = $1`,
      [bailleur_code]
    );

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, left: 40, right: 40, bottom: 40 }
    });

    // En-tête
    doc.fontSize(16).font('Helvetica-Bold').text('RAPPORT AUDIT FINANCIER', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('Justificatifs Comptables', { align: 'center' });
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    // Infos rapport
    const bailleur = bailleur_info.rows[0];
    doc.fontSize(10);
    doc.text(`Bailleur: ${bailleur?.nom || 'N/A'}`, { continued: true });
    doc.text(`  |  Période: ${date_debut} à ${date_fin}`);
    doc.text(`Généré: ${new Date().toLocaleDateString('fr-FR')}`, { continued: true });
    doc.text(`  |  Statut: CONFIDENTIEL`);
    doc.moveDown();

    // Tableau justificatifs
    doc.fontSize(9).font('Helvetica-Bold');
    const tableTop = doc.y;
    const colWidth = 110;
    const cols = [
      { label: 'Date', x: 50 },
      { label: 'Description', x: 120 },
      { label: 'Montant (FCFA)', x: 280 },
      { label: 'Validé', x: 400 },
      { label: 'Validateur', x: 450 }
    ];

    // En-tête tableau
    cols.forEach(col => {
      doc.text(col.label, col.x, tableTop, { width: 80, height: 15 });
    });

    doc.moveTo(45, doc.y).lineTo(555, doc.y).stroke();

    // Lignes données
    doc.font('Helvetica').fontSize(8);
    let totalMontant = 0;
    let nbValides = 0;

    justificatifs.rows.forEach((j, idx) => {
      const y = doc.y + 5;

      doc.text(new Date(j.date).toLocaleDateString('fr-FR'), 50, y, { width: 65 });
      doc.text(j.description?.substring(0, 25) + '...', 120, y, { width: 155 });
      doc.text(j.montant.toString(), 280, y, { width: 100, align: 'right' });
      doc.text(j.statut === 'validé' ? '✓' : '✗', 400, y, { width: 40 });
      doc.text(j.validateur_nom ? `${j.validateur_nom} ${j.validateur_prenom || ''}` : '-', 450, y, { width: 100 });

      totalMontant += j.montant;
      if (j.statut === 'validé') nbValides++;

      doc.moveDown(1.5);
    });

    // Ligne totale
    doc.moveTo(45, doc.y).lineTo(555, doc.y).stroke();
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('TOTAL', 120, doc.y + 5, { width: 155 });
    doc.text(totalMontant.toString(), 280, doc.y, { width: 100, align: 'right' });
    doc.moveDown(2);

    // Résumé
    doc.fontSize(10).font('Helvetica-Bold').text('RÉSUMÉ', { underline: true });
    doc.font('Helvetica').fontSize(9);
    doc.text(`Nombre de justificatifs: ${justificatifs.rows.length}`);
    doc.text(`Justificatifs validés: ${nbValides} (${((nbValides / justificatifs.rows.length) * 100).toFixed(1)}%)`);
    doc.text(`Montant total: ${totalMontant.toLocaleString('fr-FR')} FCFA`);
    doc.moveDown();

    // Certification
    const taux_conformite = (nbValides / justificatifs.rows.length) * 100;
    const is_conforme = taux_conformite >= 95 && nbValides === justificatifs.rows.length;

    doc.fontSize(11).font('Helvetica-Bold');
    if (is_conforme) {
      doc.fillColor('green').text('✅ DOSSIER CONFORME ET VALIDÉ', { align: 'center' });
    } else {
      doc.fillColor('red').text('❌ DOSSIER INCOMPLET OU NON VALIDÉ', { align: 'center' });
    }

    doc.fillColor('black').fontSize(8).font('Helvetica');
    doc.moveDown(1);
    doc.text('Ce rapport a été généré automatiquement par le système MSI Gestion.', { align: 'center' });
    doc.text('Signature numérique: ' + Buffer.from(Date.now().toString()).toString('base64').substring(0, 20), { align: 'center' });

    return doc;
  } catch (error) {
    logger.error('Erreur génération rapport audit:', error);
    throw error;
  }
};

// ── Rapport Conformité Achats ──────────────────────────────────────────

const genererRapportConformiteAchats = async (date_debut, date_fin) => {
  try {
    const result = await query(
      `SELECT
         COUNT(DISTINCT bc.id) AS nb_bc_total,
         COUNT(DISTINCT CASE WHEN bc.statut = 'livre_total' THEN bc.id END) AS nb_conformes,
         COUNT(DISTINCT CASE WHEN bc.date_livraison_prevue < NOW() AND bc.statut != 'livre_total' THEN bc.id END) AS nb_retard,
         COUNT(DISTINCT f.id) AS nb_fournisseurs,
         SUM(bcl.quantite_commandee * bcl.prix_unitaire) AS montant_total
       FROM bons_commande bc
       LEFT JOIN bons_commande_lignes bcl ON bc.id = bcl.commande_id
       LEFT JOIN fournisseurs f ON bc.fournisseur_id = f.id
       WHERE bc.created_at >= $1 AND bc.created_at <= $2`,
      [date_debut, date_fin]
    );

    const doc = new PDFDocument({ size: 'A4' });

    doc.fontSize(14).font('Helvetica-Bold').text('RAPPORT CONFORMITÉ ACHATS', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Période: ${date_debut} à ${date_fin}`, { align: 'center' });
    doc.moveDown();

    const data = result.rows[0];
    const taux_conf = ((data.nb_conformes / data.nb_bc_total) * 100).toFixed(1);

    doc.fontSize(12).font('Helvetica-Bold').text('Indicateurs Clés');
    doc.fontSize(10).font('Helvetica');
    doc.text(`• Bons de commande traités: ${data.nb_bc_total}`);
    doc.text(`• Conformes (livrés en totalité): ${data.nb_conformes}`);
    doc.text(`• Taux de conformité: ${taux_conf}%`);
    doc.text(`• En retard: ${data.nb_retard}`);
    doc.text(`• Fournisseurs: ${data.nb_fournisseurs}`);
    doc.text(`• Montant total engagé: ${data.montant_total?.toLocaleString('fr-FR')} FCFA`);
    doc.moveDown();

    // Évaluation
    doc.fontSize(11).font('Helvetica-Bold').fillColor(taux_conf >= 95 ? 'green' : 'red');
    doc.text(taux_conf >= 95 ? '✅ SATISFAISANT' : '⚠️ À AMÉLIORER', { align: 'center' });

    return doc;
  } catch (error) {
    logger.error('Erreur rapport conformité achats:', error);
    throw error;
  }
};

// ── Rapport Inventaire Stocks ──────────────────────────────────────────

const genererRapportInventaire = async (magasin_id, date_inventaire) => {
  try {
    const articles = await query(
      `SELECT a.*, s.quantite, s.valeur_totale
       FROM articles a
       JOIN stocks s ON a.id = s.article_id
       WHERE s.magasin_id = $1
       ORDER BY a.designation ASC`,
      [magasin_id]
    );

    const magasin = await query(
      `SELECT nom FROM magasins WHERE id = $1`,
      [magasin_id]
    );

    const doc = new PDFDocument({ size: 'A4' });

    doc.fontSize(14).font('Helvetica-Bold').text('INVENTAIRE PHYSIQUE', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Magasin: ${magasin.rows[0]?.nom || 'N/A'}`, { align: 'center' });
    doc.text(`Date d'inventaire: ${new Date(date_inventaire).toLocaleDateString('fr-FR')}`, { align: 'center' });
    doc.moveDown();

    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Code', 50, doc.y, { width: 80 });
    doc.text('Désignation', 130, doc.y, { width: 200 });
    doc.text('Quantité', 330, doc.y, { width: 80 });
    doc.text('Valeur (FCFA)', 410, doc.y, { width: 100 });
    doc.moveDown();

    doc.moveTo(45, doc.y).lineTo(555, doc.y).stroke();

    let totalValeur = 0;
    doc.fontSize(8).font('Helvetica');

    articles.rows.forEach(a => {
      doc.text(a.code || '', 50, doc.y, { width: 80 });
      doc.text(a.designation?.substring(0, 30), 130, doc.y, { width: 200 });
      doc.text(a.quantite?.toString() || '0', 330, doc.y, { width: 80, align: 'right' });
      doc.text(a.valeur_totale?.toString() || '0', 410, doc.y, { width: 100, align: 'right' });
      totalValeur += a.valeur_totale || 0;
      doc.moveDown(1);
    });

    doc.moveTo(45, doc.y).lineTo(555, doc.y).stroke();
    doc.font('Helvetica-Bold');
    doc.text('TOTAL', 130, doc.y + 5, { width: 200 });
    doc.text(totalValeur.toLocaleString('fr-FR') + ' FCFA', 410, doc.y, { width: 100, align: 'right' });

    return doc;
  } catch (error) {
    logger.error('Erreur rapport inventaire:', error);
    throw error;
  }
};

// ── Exporter PDF en réponse HTTP ────────────────────────────────────────

const envoyerPdfEnReponse = (doc, res, filename) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  doc.end();
};

module.exports = {
  genererRapportAuditJustificatifs,
  genererRapportConformiteAchats,
  genererRapportInventaire,
  envoyerPdfEnReponse
};
