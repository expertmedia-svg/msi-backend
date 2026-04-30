
const { query, saveDatabase } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function seedDemoDataLogic() {
  try {
    console.log('🌱 Lancement du seed de données démo...');

    // 1. Sites
    const sites = [
      { code: 'CSO', nom: 'Centre de Services Ouagadougou', type: 'central', ville: 'Ouagadougou' },
      { code: 'MS_LADIES', nom: 'MS Ladies Ouagadougou', type: 'point_service', ville: 'Ouagadougou' },
      { code: 'MAG_CENT', nom: 'Magasin Central Ouagadougou', type: 'central', ville: 'Ouagadougou' },
      { code: 'BOBO', nom: 'Centre Bobo-Dioulasso', type: 'regional', ville: 'Bobo-Dioulasso' },
      { code: 'KOUDOUGOU', nom: 'Centre Koudougou', type: 'regional', ville: 'Koudougou' },
    ];

    for (const s of sites) {
      await query(
        `INSERT OR IGNORE INTO sites (id, code, nom, type, ville, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [uuidv4(), s.code, s.nom, s.type, s.ville]
      );
    }

    // 2. Bailleurs
    const bailleurs = [
      { code: 'BMGF', nom: 'Bill & Melinda Gates Foundation', acronyme: 'BMGF' },
      { code: 'USAID', nom: 'US Agency for International Development', acronyme: 'USAID' },
      { code: 'GAVI', nom: 'Gavi, the Vaccine Alliance', acronyme: 'GAVI' },
    ];

    for (const b of bailleurs) {
      await query(
        `INSERT OR IGNORE INTO bailleurs (id, code, nom, acronyme, actif, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
        [uuidv4(), b.code, b.nom, b.acronyme]
      );
    }

    // 3. Projets (nécessite bailleurs et devises)
    const bailleurRows = await query('SELECT id, code FROM bailleurs');
    const bailleurIds = {};
    bailleurRows.rows.forEach(b => { bailleurIds[b.code] = b.id; });

    const deviseRows = await query("SELECT id FROM devises WHERE code = 'FCFA'");
    const deviseId = deviseRows.rows[0]?.id;

    if (deviseId) {
      const projets = [
        { code: 'PROJ-2026-001', nom: 'Programme SSR 2026 – USAID', bailleur: 'USAID', budget: 500000000 },
        { code: 'PROJ-2026-002', nom: 'Planification Familiale – BMGF', bailleur: 'BMGF', budget: 300000000 },
      ];

      for (const p of projets) {
        if (bailleurIds[p.bailleur]) {
          await query(
            `INSERT OR IGNORE INTO projets (id, code, nom, bailleur_id, date_debut, date_fin, budget_total, devise_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, '2026-01-01', '2026-12-31', ?, ?, datetime('now'), datetime('now'))`,
            [uuidv4(), p.code, p.nom, bailleurIds[p.bailleur], p.budget, deviseId]
          );
        }
      }
    }

    // 4. Catégories
    const cats = [
      { code: 'PHARMA', libelle: 'Produits pharmaceutiques' },
      { code: 'CONSOMM', libelle: 'Consommables médicaux' },
      { code: 'BUREAU', libelle: 'Fournitures de bureau' },
    ];

    for (const c of cats) {
      await query(
        `INSERT OR IGNORE INTO categories_marche (id, code, libelle) VALUES (?, ?, ?)`,
        [uuidv4(), c.code, c.libelle]
      );
    }

    // 5. Articles
    const articles = [
      { code: 'ART-001', designation: 'Contraceptifs oraux', cat: 'PHARMA', um: 'plaquette', prix: 1500, pharma: 1 },
      { code: 'ART-002', designation: 'Gants latex', cat: 'CONSOMM', um: 'boîte', prix: 6500, pharma: 0 },
      { code: 'ART-003', designation: 'Papier A4', cat: 'BUREAU', um: 'rame', prix: 2500, pharma: 0 },
    ];

    for (const a of articles) {
      await query(
        `INSERT OR IGNORE INTO articles (id, code, designation, categorie, unite_mesure, prix_unitaire_moyen, est_pharmaceutique, actif, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
        [uuidv4(), a.code, a.designation, a.cat, a.um, a.prix, a.pharma]
      );
    }

    saveDatabase();
    console.log('✅ Seed de données démo terminé !');
    return true;
  } catch (err) {
    console.error('Erreur seed demo data:', err);
    throw err;
  }
}

module.exports = seedDemoDataLogic;
