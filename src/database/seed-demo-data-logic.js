
const { query, saveDatabase } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function seedDemoDataLogic() {
  try {
    console.log('🌱 Lancement du seed de données démo MASSIVE...');

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

    const fournisseurs = [
      { code: 'F-CAMEG', nom: 'CAMEG BF', email: 'info@cameg.bf' },
      { code: 'F-SOPROFA', nom: 'SOPROFA SARL', email: 'contact@soprofa.bf' },
      { code: 'F-SODIMED', nom: 'SODIMED SARL', email: 'sales@sodimed.bf' },
    ];

    const fournisseurIds = {};
    for (const f of fournisseurs) {
      const existing = await query('SELECT id FROM fournisseurs WHERE code = ?', [f.code]);
      if (existing.rows.length > 0) {
        fournisseurIds[f.nom] = existing.rows[0].id;
      } else {
        const id = uuidv4();
        await query(`INSERT INTO fournisseurs (id, code, nom, email, actif) VALUES (?, ?, ?, ?, 1)`, [id, f.code, f.nom, f.email]);
        fournisseurIds[f.nom] = id;
      }
    }

    // 4. Utilisateurs
    const adminRes = await query("SELECT id FROM utilisateurs WHERE email = 'adminmsi@mariestopes-bf.org'");
    const adminId = adminRes.rows[0]?.id;

    // 5. TRANSACTIONS MASSIVES
    if (adminId) {
      const statuses = ['soumis', 'en_validation', 'approuve', 'rejete'];
      
      // A. Demandes d'achat (15 DAs)
      for (let i = 1; i <= 15; i++) {
        const daId = uuidv4();
        const siteCode = Object.keys(siteIds)[i % 5];
        const projCode = Object.keys(projetIds)[i % 3];
        const status = statuses[i % 4];
        const amount = 50000 + Math.floor(Math.random() * 500000);
        
        await query(
          `INSERT OR IGNORE INTO demandes_achat (id, numero, titre, demandeur_id, site_id, projet_id, statut, montant_estime, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-${i} days'))`,
          [daId, `DA-2026-${String(i).padStart(4, '0')}`, `Besoin démo ${i}`, adminId, siteIds[siteCode], projetIds[projCode], status, amount]
        );
      }

      // B. Bons de commande (10 BCs)
      const bcStatuses = ['brouillon', 'en_cours', 'livre_partiel', 'livre_total', 'annule'];
      for (let i = 1; i <= 10; i++) {
        const bcId = uuidv4();
        const fName = Object.keys(fournisseurIds)[i % 3];
        const projCode = Object.keys(projetIds)[i % 3];
        const status = bcStatuses[i % 5];
        const amount = 100000 + Math.floor(Math.random() * 1000000);
        const delayed = i === 2 || i === 5 ? '2026-01-01' : '2026-12-31'; // Some delayed
        
        await query(
          `INSERT OR IGNORE INTO bons_commande (id, numero, fournisseur_id, projet_id, montant_ht, montant_ttc, statut, date_livraison_prevue, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-${i * 2} days'))`,
          [bcId, `BC-2026-${String(i).padStart(4, '0')}`, fournisseurIds[fName], projetIds[projCode], amount, amount, status, delayed]
        );
      }

      // C. Stocks & Magasins (Détail)
      const magId = uuidv4();
      await query(`INSERT OR IGNORE INTO magasins (id, code, nom, site_id, actif) VALUES (?, 'MAG-DEMO', 'Magasin Central Démo', ?, 1)`, [magId, siteIds['CSO']]);

      for (const aCode of Object.keys(articleIds)) {
        const artId = articleIds[aCode];
        const qty = 10 + Math.floor(Math.random() * 200);
        const price = articles.find(a => a.code === aCode)?.prix || 5000;
        const totalValue = qty * price;

        // Mise à jour table STOCKS (Indispensable pour le dashboard)
        await query(
          `INSERT OR REPLACE INTO stocks (id, article_id, magasin_id, quantite, cump, valeur_totale, stock_min, stock_securite)
           VALUES (?, ?, ?, ?, ?, ?, 20, 10)`,
          [uuidv4(), artId, magId, qty, price, totalValue]
        );

        // Ajout d'un Lot
        const lotId = uuidv4();
        const expiry = aCode.startsWith('PH') ? "datetime('now', '+3 months')" : "datetime('now', '+2 years')";
        await query(
          `INSERT INTO lots (id, article_id, magasin_id, numero_lot, quantite, prix_unitaire, date_peremption)
           VALUES (?, ?, ?, ?, ?, ?, ${expiry})`,
          [lotId, artId, magId, `LOT-${aCode}-DEMO`, qty, price]
        );

        // Ajout d'un mouvement
        await query(
          `INSERT INTO mouvements_stock (id, type_mouvement, article_id, lot_id, magasin_dest_id, quantite, prix_unitaire, valeur, saisi_par)
           VALUES (?, 'entree', ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), artId, lotId, magId, qty, price, totalValue, adminId]
        );
      }

      // D. Flotte (5 véhicules)
      const vehicules = [
        { plate: '11-6655-BF', model: 'Toyota Hilux', type: '4x4' },
        { plate: '11-7788-BF', model: 'Toyota Land Cruiser', type: '4x4' },
        { plate: '11-2233-BF', model: 'Yamaha AG100', type: 'Moto' },
        { plate: '11-4499-BF', model: 'Toyota Hilux', type: '4x4' },
        { plate: '11-0011-BF', model: 'Toyota Prado', type: 'SUV' },
      ];

      for (let i = 0; i < vehicules.length; i++) {
        const v = vehicules[i];
        const equipId = uuidv4();
        await query(
          `INSERT INTO equipements (id, code_etiquette, designation, statut, site_id)
           VALUES (?, ?, ?, 'en_service', ?)`,
          [equipId, `VEH-${String(i+1).padStart(3, '0')}`, v.model, siteIds['CSO']]
        );

        const vId = uuidv4();
        await query(
          `INSERT INTO vehicules (id, equipement_id, immatriculation, marque, modele, type_vehicule, actif)
           VALUES (?, ?, ?, 'Toyota', ?, ?, 1)`,
          [vId, equipId, v.plate, v.model, v.type]
        );

        // Missions (10 missions)
        const mId = uuidv4();
        await query(
          `INSERT INTO missions (id, numero, vehicule_id, destination, date_depart, statut, created_by)
           VALUES (?, ?, ?, 'Ouagadougou - Bobo', datetime('now', '-${i} days'), 'terminee', ?)`,
          [mId, `MISS-2026-${String(i+1).padStart(3, '0')}`, vId, adminId]
        );
      }

      // E. Alertes (3 alertes actives)
      await query(
        `INSERT INTO alertes_stock (id, type_alerte, article_id, message, statut)
         VALUES (?, 'rupture', ?, 'Rupture de stock critique détectée', 'active')`,
        [uuidv4(), articleIds['PH-001']]
      );
      await query(
        `INSERT INTO alertes_stock (id, type_alerte, message, statut)
         VALUES (?, 'securite', 'Maintenance préventive véhicule 11-6655-BF requise', 'active')`,
        [uuidv4()]
      );
    }

    saveDatabase();
    console.log('✅ Seed de données démo MASSIVE terminé !');
    return true;
  } catch (err) {
    console.error('Erreur détaillée seed demo data:', err);
    throw err;
  }
}

module.exports = seedDemoDataLogic;
