
const { query, saveDatabase } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function seedDemoDataLogic() {
  try {
    console.log('🌱 Lancement du seed de données démo complet...');

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
      const id = uuidv4();
      await query(
        `INSERT OR IGNORE INTO sites (id, code, nom, type, ville, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [id, s.code, s.nom, s.type, s.ville]
      );
      siteIds[s.code] = id;
    }

    // 2. Bailleurs
    const bailleurs = [
      { code: 'BMGF', nom: 'Bill & Melinda Gates Foundation', acronyme: 'BMGF' },
      { code: 'USAID', nom: 'US Agency for International Development', acronyme: 'USAID' },
      { code: 'GAVI', nom: 'Gavi, the Vaccine Alliance', acronyme: 'GAVI' },
    ];

    const bailleurIds = {};
    for (const b of bailleurs) {
      const id = uuidv4();
      await query(
        `INSERT OR IGNORE INTO bailleurs (id, code, nom, acronyme, actif, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
        [id, b.code, b.nom, b.acronyme]
      );
      bailleurIds[b.code] = id;
    }

    // 3. Devises
    const deviseRows = await query("SELECT id FROM devises WHERE code = 'FCFA'");
    const deviseId = deviseRows.rows[0]?.id;

    // 4. Projets
    const projetIds = {};
    if (deviseId) {
      const projets = [
        { code: 'PROJ-2026-001', nom: 'Programme SSR 2026 – USAID', bailleur: 'USAID', budget: 500000000 },
        { code: 'PROJ-2026-002', nom: 'Planification Familiale – BMGF', bailleur: 'BMGF', budget: 300000000 },
      ];

      for (const p of projets) {
        if (bailleurIds[p.bailleur]) {
          const id = uuidv4();
          await query(
            `INSERT OR IGNORE INTO projets (id, code, nom, bailleur_id, date_debut, date_fin, budget_total, devise_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, '2026-01-01', '2026-12-31', ?, ?, datetime('now'), datetime('now'))`,
            [id, p.code, p.nom, bailleurIds[p.bailleur], p.budget, deviseId]
          );
          projetIds[p.code] = id;
        }
      }
    }

    // 5. Catégories
    const catIds = {};
    const cats = [
      { code: 'PHARMA', libelle: 'Produits pharmaceutiques' },
      { code: 'CONSOMM', libelle: 'Consommables médicaux' },
      { code: 'BUREAU', libelle: 'Fournitures de bureau' },
    ];

    for (const c of cats) {
      const id = uuidv4();
      await query(
        `INSERT OR IGNORE INTO categories_marche (id, code, libelle) VALUES (?, ?, ?)`,
        [id, c.code, c.libelle]
      );
      catIds[c.code] = id;
    }

    // 6. Articles
    const articleIds = {};
    const articles = [
      { code: 'ART-001', designation: 'Contraceptifs oraux', cat: 'PHARMA', um: 'plaquette', prix: 1500, pharma: 1 },
      { code: 'ART-002', designation: 'Gants latex', cat: 'CONSOMM', um: 'boîte', prix: 6500, pharma: 0 },
      { code: 'ART-003', designation: 'Papier A4', cat: 'BUREAU', um: 'rame', prix: 2500, pharma: 0 },
    ];

    for (const a of articles) {
      const id = uuidv4();
      await query(
        `INSERT OR IGNORE INTO articles (id, code, designation, categorie, unite_mesure, prix_unitaire_moyen, est_pharmaceutique, actif, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
        [id, a.code, a.designation, a.cat, a.um, a.prix, a.pharma]
      );
      articleIds[a.code] = id;
    }

    // 7. Fournisseurs
    const fournisseurIds = {};
    const fournisseurs = [
      { nom: 'SOPROFA', contact: 'Ouedraogo', email: 'contact@soprofa.bf' },
      { nom: 'CAMEG', contact: 'Diallo', email: 'info@cameg.bf' },
    ];

    for (const f of fournisseurs) {
      const id = uuidv4();
      await query(
        `INSERT OR IGNORE INTO fournisseurs (id, nom, contact_principal, email, actif, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
        [id, f.nom, f.contact, f.email]
      );
      fournisseurIds[f.nom] = id;
    }

    // 8. Utilisateurs (si non présents)
    const adminRes = await query("SELECT id FROM utilisateurs WHERE email = 'adminmsi@mariestopes-bf.org'");
    const adminId = adminRes.rows[0]?.id;

    // 9. Données transactionnelles (pour remplir le dashboard)
    if (adminId && siteIds['CSO'] && projetIds['PROJ-2026-001']) {
      // Demandes d'achat
      const daId = uuidv4();
      await query(
        `INSERT INTO demandes_achat (id, numero, titre, demandeur_id, site_id, projet_id, statut, montant_estime, created_at)
         VALUES (?, 'DA-2026-0001', 'Besoin urgent de gants', ?, ?, ?, 'soumis', 130000, datetime('now'))`,
        [daId, adminId, siteIds['CSO'], projetIds['PROJ-2026-001']]
      );

      // Bons de commande
      const bcId = uuidv4();
      await query(
        `INSERT INTO bons_commande (id, numero, fournisseur_id, projet_id, montant_ht, montant_ttc, statut, created_at)
         VALUES (?, 'BC-2026-0001', ?, ?, 130000, 130000, 'en_cours', datetime('now'))`,
        [bcId, fournisseurIds['CAMEG'], projetIds['PROJ-2026-001']]
      );

      // Magasins
      const magId = uuidv4();
      await query(
        `INSERT OR IGNORE INTO magasins (id, site_id, nom, code, actif)
         VALUES (?, ?, 'Magasin Central', 'MAG-01', 1)`,
        [magId, siteIds['CSO']]
      );

      // Stocks (Lots et mouvements)
      if (articleIds['ART-001']) {
        const lotId = uuidv4();
        await query(
          `INSERT INTO lots (id, article_id, magasin_id, numero_lot, quantite, prix_unitaire)
           VALUES (?, ?, ?, 'LOT-DEMO-001', 500, 1500)`,
          [lotId, articleIds['ART-001'], magId]
        );

        await query(
          `INSERT INTO mouvements_stock (id, type_mouvement, article_id, lot_id, magasin_dest_id, quantite, prix_unitaire, valeur, created_at)
           VALUES (?, 'entree', ?, ?, ?, 500, 1500, 750000, datetime('now'))`,
          [uuidv4(), articleIds['ART-001'], lotId, magId]
        );
      }
    }

    saveDatabase();
    console.log('✅ Seed de données démo COMPLET terminé !');
    return true;
  } catch (err) {
    console.error('Erreur seed demo data:', err);
    throw err;
  }
}

module.exports = seedDemoDataLogic;
