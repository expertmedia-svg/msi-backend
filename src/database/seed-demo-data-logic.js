
const { query, saveDatabase } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function seedDemoDataLogic() {
  try {
    console.log('🌱 Lancement du seed de données démo ULTIME...');

    // 1. Nettoyage préalable pour éviter les doublons ou conflits
    await query("DELETE FROM mouvements_stock");
    await query("DELETE FROM stocks");
    await query("DELETE FROM lots");
    await query("DELETE FROM offres_lignes");
    await query("DELETE FROM offres_fournisseurs");
    await query("DELETE FROM demandes_devis_fournisseurs");
    await query("DELETE FROM demandes_devis");
    await query("DELETE FROM demandes_achat_lignes");
    await query("DELETE FROM demandes_achat");

    // 2. Sites
    const sites = [
      { code: 'CSO', nom: 'Centre de Services Ouagadougou', type: 'central', ville: 'Ouagadougou' },
      { code: 'BOBO', nom: 'Centre Bobo-Dioulasso', type: 'regional', ville: 'Bobo-Dioulasso' },
    ];
    const siteIds = {};
    for (const s of sites) {
      let res = await query('SELECT id FROM sites WHERE code = ?', [s.code]);
      if (res.rows.length > 0) siteIds[s.code] = res.rows[0].id;
      else {
        const id = uuidv4();
        await query(`INSERT INTO sites (id, code, nom, type, ville) VALUES (?, ?, ?, ?, ?)`, [id, s.code, s.nom, s.type, s.ville]);
        siteIds[s.code] = id;
      }
    }

    // 3. Fournisseurs (3 pour la comparaison)
    const fournisseurs = [
      { code: 'F-CAMEG', nom: 'CAMEG BF', note: 4.5 },
      { code: 'F-SOPROFA', nom: 'SOPROFA SARL', note: 3.8 },
      { code: 'F-SODIMED', nom: 'SODIMED SARL', note: 4.2 },
    ];
    const fIds = {};
    for (const f of fournisseurs) {
      let res = await query('SELECT id FROM fournisseurs WHERE code = ?', [f.code]);
      if (res.rows.length > 0) fIds[f.nom] = res.rows[0].id;
      else {
        const id = uuidv4();
        await query(`INSERT INTO fournisseurs (id, code, nom, note_globale, actif) VALUES (?, ?, ?, ?, 1)`, [id, f.code, f.nom, f.note]);
        fIds[f.nom] = id;
      }
    }

    // 4. Admin
    const adminRes = await query("SELECT id FROM utilisateurs WHERE email = 'adminmsi@mariestopes-bf.org'");
    const adminId = adminRes.rows[0]?.id;

    if (adminId) {
      // 5. Scenario de Comparaison de Prix
      const daId = uuidv4();
      await query(
        `INSERT INTO demandes_achat (id, numero, titre, demandeur_id, site_id, statut, montant_estime, created_at)
         VALUES (?, 'DA-2026-COMP', 'Achat Groupé Médicaments', ?, ?, 'soumis', 750000, datetime('now'))`,
        [daId, adminId, siteIds['CSO']]
      );

      const articlesComp = [
        { desc: 'Sayana Press', qty: 100, unit: 'dose', base: 2500 },
        { desc: 'Implanon NXT', qty: 50, unit: 'unité', base: 12000 },
      ];

      const ddId = uuidv4();
      await query(`INSERT INTO demandes_devis (id, numero, demande_achat_id, statut) VALUES (?, 'DD-2026-001', ?, 'ouvert')`, [ddId, daId]);

      for (const art of articlesComp) {
        const dalId = uuidv4();
        await query(
          `INSERT INTO demandes_achat_lignes (id, demande_id, description, quantite, unite_mesure, prix_unitaire_estime)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [dalId, daId, art.desc, art.qty, art.unit, art.base]
        );

        // Créer des offres pour chaque fournisseur
        let idx = 0;
        for (const [fName, fId] of Object.entries(fIds)) {
          // Liaison DD-Fournisseur (si pas déjà fait pour ce DD)
          const ddfRes = await query(`SELECT id FROM demandes_devis_fournisseurs WHERE demande_devis_id = ? AND fournisseur_id = ?`, [ddId, fId]);
          let ddfId;
          if (ddfRes.rows.length > 0) ddfId = ddfRes.rows[0].id;
          else {
            ddfId = uuidv4();
            await query(`INSERT INTO demandes_devis_fournisseurs (id, demande_devis_id, fournisseur_id, statut) VALUES (?, ?, ?, 'repondu')`, [ddfId, ddId, fId]);
          }

          // Offre globale du fournisseur (si pas déjà fait)
          const offreRes = await query(`SELECT id FROM offres_fournisseurs WHERE ddq_fournisseur_id = ?`, [ddfId]);
          let offreId;
          if (offreRes.rows.length > 0) offreId = offreRes.rows[0].id;
          else {
            offreId = uuidv4();
            await query(`INSERT INTO offres_fournisseurs (id, ddq_fournisseur_id, delai_livraison_jours) VALUES (?, ?, ?)`, [offreId, ddfId, 5 + idx]);
          }

          // Ligne d'offre spécifique à l'article
          const variation = (idx === 0) ? -200 : (idx === 1) ? 100 : 0; // CAMEG moins cher
          await query(
            `INSERT INTO offres_lignes (id, offre_id, demande_ligne_id, prix_unitaire, prix_unitaire_fcfa)
             VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), offreId, dalId, art.base + variation, art.base + variation]
          );
          idx++;
        }
      }

      // 6. Stocks
      const magId = uuidv4();
      await query(`INSERT INTO magasins (id, code, nom, site_id, actif) VALUES (?, 'MAG-TEST', 'Magasin Central', ?, 1)`, [magId, siteIds['CSO']]);
      
      const artStock = { desc: 'Paracétamol 500mg', qty: 1500, price: 500 };
      const artId = uuidv4();
      await query(`INSERT INTO articles (id, code, designation, actif) VALUES (?, 'ART-STOCK', ?, 1)`, [artId, artStock.desc]);
      
      await query(
        `INSERT INTO stocks (id, article_id, magasin_id, quantite, cump, valeur_totale, stock_min)
         VALUES (?, ?, ?, ?, ?, ?, 100)`,
        [uuidv4(), artId, magId, artStock.qty, artStock.price, artStock.qty * artStock.price]
      );
    }

    saveDatabase();
    console.log('✅ Seed de données démo ULTIME terminé !');
    return true;
  } catch (err) {
    console.error('Erreur détaillée seed demo data:', err);
    throw err;
  }
}

module.exports = seedDemoDataLogic;
