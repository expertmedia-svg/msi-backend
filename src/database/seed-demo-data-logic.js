
const { query, saveDatabase } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function seedDemoDataLogic() {
  try {
    console.log('🌱 Lancement du seed de données démo MASSIVE & COMPLÈTE...');

    // 1. Sites
    const sites = [
      { code: 'CSO', nom: 'Centre de Services Ouagadougou', type: 'central', ville: 'Ouagadougou' },
      { code: 'MS_LADIES', nom: 'MS Ladies Ouagadougou', type: 'point_service', ville: 'Ouagadougou' },
      { code: 'MAG_CENT', nom: 'Magasin Central Ouagadougou', type: 'central', ville: 'Ouagadougou' },
      { code: 'BOBO', nom: 'Centre Bobo-Dioulasso', type: 'regional', ville: 'Bobo-Dioulasso' },
      { code: 'KOUDOUGOU', nom: 'Centre Koudougou', type: 'regional', ville: 'Koudougou' },
    ];

    const siteIds = {};
    for (const s of sites) {
      const existing = await query('SELECT id FROM sites WHERE code = ?', [s.code]);
      if (existing.rows.length > 0) {
        siteIds[s.code] = existing.rows[0].id;
      } else {
        const id = uuidv4();
        await query(`INSERT INTO sites (id, code, nom, type, ville) VALUES (?, ?, ?, ?, ?)`, [id, s.code, s.nom, s.type, s.ville]);
        siteIds[s.code] = id;
      }
    }

    // 2. Bailleurs & Projets & Devises
    const deviseRows = await query("SELECT id FROM devises WHERE code = 'FCFA'");
    const deviseId = deviseRows.rows[0]?.id;

    const bailleurs = [
      { code: 'BMGF', nom: 'Bill & Melinda Gates Foundation', acronyme: 'BMGF' },
      { code: 'USAID', nom: 'US Agency for International Development', acronyme: 'USAID' },
      { code: 'GAVI', nom: 'Gavi, the Vaccine Alliance', acronyme: 'GAVI' },
    ];

    const bailleurIds = {};
    for (const b of bailleurs) {
      const existing = await query('SELECT id FROM bailleurs WHERE code = ?', [b.code]);
      if (existing.rows.length > 0) {
        bailleurIds[b.code] = existing.rows[0].id;
      } else {
        const id = uuidv4();
        await query(`INSERT INTO bailleurs (id, code, nom, acronyme, actif) VALUES (?, ?, ?, ?, 1)`, [id, b.code, b.nom, b.acronyme]);
        bailleurIds[b.code] = id;
      }
    }

    const projetIds = {};
    const projets = [
      { code: 'PROJ-SSR-2026', nom: 'Programme SSR 2026 – USAID', bailleur: 'USAID', budget: 500000000 },
      { code: 'PROJ-PF-BMGF', nom: 'Planification Familiale – BMGF', bailleur: 'BMGF', budget: 300000000 },
      { code: 'PROJ-VAC-GAVI', nom: 'Campagne Vaccination – GAVI', bailleur: 'GAVI', budget: 150000000 },
    ];

    for (const p of projets) {
      const existing = await query('SELECT id FROM projets WHERE code = ?', [p.code]);
      if (existing.rows.length > 0) {
        projetIds[p.code] = existing.rows[0].id;
      } else {
        const id = uuidv4();
        await query(
          `INSERT INTO projets (id, code, nom, bailleur_id, date_debut, date_fin, budget_total, devise_id)
           VALUES (?, ?, ?, ?, '2026-01-01', '2026-12-31', ?, ?)`,
          [id, p.code, p.nom, bailleurIds[p.bailleur], p.budget, deviseId]
        );
        projetIds[p.code] = id;
      }
    }

    // 3. Articles & Fournisseurs
    const articles = [
      { code: 'PH-001', designation: 'Sayana Press', cat: 'PHARMA', um: 'dose', prix: 2500 },
      { code: 'PH-002', designation: 'Implanon NXT', cat: 'PHARMA', um: 'unité', prix: 15000 },
      { code: 'CONS-001', designation: 'Gants de soins M', cat: 'CONSOMM', um: 'boîte', prix: 4500 },
      { code: 'CONS-002', designation: 'Seringues 5ml', cat: 'CONSOMM', um: 'boîte', prix: 3200 },
      { code: 'BUR-001', designation: 'Papier A4 80g', cat: 'BUREAU', um: 'rame', prix: 2800 },
    ];

    const articleIds = {};
    for (const a of articles) {
      const existing = await query('SELECT id FROM articles WHERE code = ?', [a.code]);
      if (existing.rows.length > 0) {
        articleIds[a.code] = existing.rows[0].id;
      } else {
        const id = uuidv4();
        await query(
          `INSERT INTO articles (id, code, designation, categorie, unite_mesure, prix_unitaire_moyen, actif)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [id, a.code, a.designation, a.cat, a.um, a.prix]
        );
        articleIds[a.code] = id;
      }
    }

    const fournisseursData = [
      { code: 'F-CAMEG', nom: 'CAMEG BF', email: 'info@cameg.bf', contact: 'M. Diallo' },
      { code: 'F-SOPROFA', nom: 'SOPROFA SARL', email: 'contact@soprofa.bf', contact: 'Mme Ouedraogo' },
      { code: 'F-SODIMED', nom: 'SODIMED SARL', email: 'sales@sodimed.bf', contact: 'M. Sawadogo' },
    ];

    const fIds = {};
    for (const f of fournisseursData) {
      const existing = await query('SELECT id FROM fournisseurs WHERE code = ?', [f.code]);
      if (existing.rows.length > 0) {
        fIds[f.nom] = existing.rows[0].id;
      } else {
        const id = uuidv4();
        await query(`INSERT INTO fournisseurs (id, code, nom, email, contact_nom, actif) VALUES (?, ?, ?, ?, ?, 1)`, [id, f.code, f.nom, f.email, f.contact]);
        fIds[f.nom] = id;
      }
    }

    // 4. Utilisateurs
    const adminRes = await query("SELECT id FROM utilisateurs WHERE email = 'adminmsi@mariestopes-bf.org'");
    const adminId = adminRes.rows[0]?.id;

    // 5. TRANSACTIONS MASSIVES
    if (adminId) {
      const ts = Date.now().toString().slice(-4);
      
      // A. Demandes d'achat (15 DAs)
      const lastDaIds = [];
      for (let i = 1; i <= 15; i++) {
        const daId = uuidv4();
        lastDaIds.push(daId);
        const siteCode = Object.keys(siteIds)[i % 5];
        const projCode = Object.keys(projetIds)[i % 3];
        const amount = 50000 + Math.floor(Math.random() * 500000);
        
        await query(
          `INSERT OR IGNORE INTO demandes_achat (id, numero, titre, demandeur_id, site_id, projet_id, statut, montant_estime, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'soumis', ?, datetime('now', '-${i} days'))`,
          [daId, `DA-2026-${String(i).padStart(4, '0')}`, `Besoin démo ${i}`, adminId, siteIds[siteCode], projetIds[projCode], amount]
        );

        // Lignes DA (essentiel pour le comparateur)
        const dalId = uuidv4();
        await query(
          `INSERT INTO demandes_achat_lignes (id, demande_id, article_id, quantite, unite_mesure, prix_unitaire_estime)
           VALUES (?, ?, ?, 100, 'unité', 2500)`,
          [dalId, daId, articleIds['PH-001']]
        );

        // COMPARATEUR DE PRIX (Scenario)
        if (i === 1) {
          const ddId = uuidv4();
          await query(`INSERT INTO demandes_devis (id, numero, demande_achat_id, statut) VALUES (?, ?, ?, 'ouvert')`, [ddId, `DD-2026-0001`, daId]);
          
          for (const [fName, fId] of Object.entries(fIds)) {
            const ddfId = uuidv4();
            await query(`INSERT INTO demandes_devis_fournisseurs (id, demande_devis_id, fournisseur_id, statut) VALUES (?, ?, ?, 'repondu')`, [ddfId, ddId, fId]);
            
            const offreId = uuidv4();
            await query(`INSERT INTO offres_fournisseurs (id, ddq_fournisseur_id, delai_livraison_jours) VALUES (?, ?, 5)`, [offreId, ddfId]);
            
            await query(
              `INSERT INTO offres_lignes (id, offre_id, demande_ligne_id, prix_unitaire, prix_unitaire_fcfa)
               VALUES (?, ?, ?, ?, ?)`,
              [uuidv4(), offreId, dalId, 2000 + Math.random() * 1000, 2000 + Math.random() * 1000]
            );
          }
        }
      }

      // B. Bons de commande (10 BCs)
      for (let i = 1; i <= 10; i++) {
        const bcId = uuidv4();
        const fName = Object.keys(fIds)[i % 3];
        const projCode = Object.keys(projetIds)[i % 3];
        const amount = 100000 + Math.floor(Math.random() * 1000000);
        
        await query(
          `INSERT OR IGNORE INTO bons_commande (id, numero, fournisseur_id, projet_id, montant_ht, montant_ttc, statut, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'en_cours', datetime('now', '-${i * 2} days'))`,
          [bcId, `BC-2026-${String(i).padStart(4, '0')}`, fIds[fName], projetIds[projCode], amount, amount]
        );
      }

      // C. Stocks (Idempotence & Valeur)
      const magId = uuidv4();
      await query(`INSERT OR IGNORE INTO magasins (id, code, nom, site_id, actif) VALUES (?, 'MAG-CENTRAL', 'Magasin Principal', ?, 1)`, [magId, siteIds['CSO']]);

      for (const aCode of Object.keys(articleIds)) {
        const artId = articleIds[aCode];
        const qty = 200 + Math.floor(Math.random() * 500);
        const price = articles.find(a => a.code === aCode)?.prix || 5000;
        
        await query(`DELETE FROM stocks WHERE article_id = ? AND magasin_id = ?`, [artId, magId]);
        await query(
          `INSERT INTO stocks (id, article_id, magasin_id, quantite, cump, valeur_totale, stock_min)
           VALUES (?, ?, ?, ?, ?, ?, 50)`,
          [uuidv4(), artId, magId, qty, price, qty * price]
        );
      }
    }

    saveDatabase();
    console.log('✅ Seed de données démo MASSIVE & COMPLÈTE terminé !');
    return true;
  } catch (err) {
    console.error('Erreur détaillée seed demo data:', err);
    throw err;
  }
}

module.exports = seedDemoDataLogic;
