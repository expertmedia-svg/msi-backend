
const { query, saveDatabase, transaction } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function seedDemoDataLogic() {
  try {
    console.log('🌱 Lancement du seed de données démo ULTIME V2...');

    // 1. Nettoyage (Ordre important pour les FK)
    const tables = [
      'alertes_stock', 'maintenances', 'incidents_vehicule', 'approvisionnements_carburant', 
      'fiches_suivi_journalier', 'missions', 'vehicules', 'equipements_affectations', 
      'equipements_sorties', 'equipements', 'inventaires_lignes', 'inventaires', 
      'mouvements_stock', 'lots', 'stocks', 'emplacements', 'magasins', 
      'receptions_lignes', 'receptions', 'bons_commande_lignes', 'bons_commande', 
      'offres_lignes', 'offres_fournisseurs', 'demandes_devis_fournisseurs', 
      'demandes_devis', 'demandes_achat_lignes', 'demandes_achat', 
      'articles_prix_historique', 'articles', 'fournisseurs_evaluations', 
      'fournisseurs_documents', 'fournisseurs', 'lignes_budgetaires', 'projets', 
      'bailleurs', 'sites'
    ];

    for (const table of tables) {
      await query(`DELETE FROM ${table}`);
    }

    // 2. Référentiels de base
    const siteData = [
      { code: 'CSO', nom: 'Centre de Services Ouagadougou', type: 'central', ville: 'Ouagadougou' },
      { code: 'BOBO', nom: 'Centre Régional Bobo', type: 'regional', ville: 'Bobo-Dioulasso' },
      { code: 'KDG', nom: 'Centre Régional Koudougou', type: 'regional', ville: 'Koudougou' },
    ];
    const siteIds = {};
    for (const s of siteData) {
      const id = uuidv4();
      await query(`INSERT INTO sites (id, code, nom, type, ville) VALUES (?, ?, ?, ?, ?)`, [id, s.code, s.nom, s.type, s.ville]);
      siteIds[s.code] = id;
    }

    const bailleurs = [
      { code: 'USAID', nom: 'USAID Burkina' },
      { code: 'BMGF', nom: 'Gates Foundation' },
    ];
    const bailleurIds = {};
    for (const b of bailleurs) {
      const id = uuidv4();
      await query(`INSERT INTO bailleurs (id, code, nom, actif) VALUES (?, ?, ?, 1)`, [id, b.code, b.nom]);
      bailleurIds[b.code] = id;
    }

    const projects = [
      { code: 'PROJ-SSR', nom: 'Santé Sexuelle et Reproductive 2026', bailleur: 'USAID', budget: 500000000 },
      { code: 'PROJ-PF', nom: 'Planification Familiale rurale', bailleur: 'BMGF', budget: 250000000 },
    ];
    const projIds = {};
    const deviseId = (await query("SELECT id FROM devises WHERE code = 'FCFA'")).rows[0]?.id;

    for (const p of projects) {
      const id = uuidv4();
      await query(`INSERT INTO projets (id, code, nom, bailleur_id, budget_total, devise_id, statut) VALUES (?, ?, ?, ?, ?, ?, 'actif')`, 
        [id, p.code, p.nom, bailleurIds[p.bailleur], p.budget, deviseId]);
      projIds[p.code] = id;
      
      // Lignes budgétaires
      await query(`INSERT INTO lignes_budgetaires (id, projet_id, code, libelle, budget) VALUES (?, ?, '6011', 'Achat Médicaments', ?)`, [uuidv4(), id, p.budget * 0.6]);
      await query(`INSERT INTO lignes_budgetaires (id, projet_id, code, libelle, budget) VALUES (?, ?, '6012', 'Consommables', ?)`, [uuidv4(), id, p.budget * 0.3]);
    }

    // 3. Fournisseurs & Articles
    const suppliers = [
      { code: 'F-CAMEG', nom: 'CAMEG BF', note: 4.8 },
      { code: 'F-SOPROFA', nom: 'SOPROFA', note: 3.9 },
      { code: 'F-SODIMED', nom: 'SODIMED', note: 4.1 },
      { code: 'F-TOTAL', nom: 'TOTAL Energies', note: 4.5 },
      { code: 'F-LABOREX', nom: 'LABOREX', note: 4.3 },
    ];
    const supplierIds = [];
    for (const f of suppliers) {
      const id = uuidv4();
      await query(`INSERT INTO fournisseurs (id, code, nom, note_globale, actif) VALUES (?, ?, ?, ?, 1)`, [id, f.code, f.nom, f.note]);
      supplierIds.push(id);
    }

    const articles = [
      { code: 'ART-001', des: 'Sayana Press 104mg', cat: 'PHARMA', unit: 'dose', price: 2500, pharma: 1 },
      { code: 'ART-002', des: 'Implanon NXT', cat: 'PHARMA', unit: 'unité', price: 12000, pharma: 1 },
      { code: 'ART-003', des: 'Gants examen (boîte 100)', cat: 'CONSOMM', unit: 'boîte', price: 5500, pharma: 0 },
      { code: 'ART-004', des: 'Paracétamol 500mg (boîte)', cat: 'PHARMA', unit: 'boîte', price: 1200, pharma: 1 },
      { code: 'ART-005', des: 'Misoprostol 200mcg', cat: 'PHARMA', unit: 'comprimé', price: 450, pharma: 1 },
      { code: 'ART-006', des: 'Seringues 5ml (boîte)', cat: 'CONSOMM', unit: 'boîte', price: 4800, pharma: 0 },
      { code: 'ART-007', des: 'Plaquette 28 jours', cat: 'PHARMA', unit: 'plaquette', price: 1500, pharma: 1 },
      { code: 'ART-008', des: 'Amoxicilline 500mg', cat: 'PHARMA', unit: 'boîte', price: 3500, pharma: 1 },
      { code: 'ART-009', des: 'Alcool 70° (litre)', cat: 'CONSOMM', unit: 'litre', price: 1800, pharma: 0 },
      { code: 'ART-010', des: 'Tests grossesse', cat: 'PHARMA', unit: 'boîte', price: 15000, pharma: 1 },
    ];
    const artIds = [];
    for (const a of articles) {
      const id = uuidv4();
      await query(`INSERT INTO articles (id, code, designation, categorie, unite_mesure, prix_unitaire_moyen, est_pharmaceutique, actif) 
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)`, [id, a.code, a.des, a.cat, a.unit, a.price, a.pharma]);
      artIds.push({ id, ...a });
    }

    // 4. Utilisateurs
    const adminRes = await query("SELECT id FROM utilisateurs WHERE email = 'adminmsi@mariestopes-bf.org'");
    const adminId = adminRes.rows[0]?.id;
    if (!adminId) throw new Error("Compte admin introuvable");

    // 5. ACHATS (Cycle complet)
    console.log('  - Génération des achats...');
    // DAs diverses
    const statusesDA = ['brouillon', 'soumis', 'en_validation', 'approuve', 'rejete'];
    for (let i = 1; i <= 15; i++) {
      const id = uuidv4();
      const status = statusesDA[i % statusesDA.length];
      const montant = 100000 + Math.random() * 2000000;
      await query(`INSERT INTO demandes_achat (id, numero, titre, demandeur_id, site_id, projet_id, statut, montant_estime, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-${i} days'))`,
        [id, `DA-2026-${String(i).padStart(3, '0')}`, `Besoin Matériel ${i}`, adminId, siteIds['CSO'], projIds['PROJ-SSR'], status, montant]);
      
      // Lignes pour chaque DA
      for (let j = 0; j < 2; j++) {
        const art = artIds[Math.floor(Math.random() * artIds.length)];
        await query(`INSERT INTO demandes_achat_lignes (id, demande_id, article_id, description, quantite, unite_mesure, prix_unitaire_estime)
          VALUES (?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), id, art.id, art.des, 10 + j * 5, art.unit, art.price]);
      }
    }

    // BCs (Bons de Commande)
    const statusesBC = ['brouillon', 'confirme', 'en_cours', 'livre_partiel', 'livre_total'];
    for (let i = 1; i <= 10; i++) {
      const id = uuidv4();
      const status = statusesBC[i % statusesBC.length];
      const supplierId = supplierIds[i % supplierIds.length];
      const deliveryDate = i < 5 ? "datetime('now', '-2 days')" : "datetime('now', '+10 days')"; // Certains en retard
      
      await query(`INSERT INTO bons_commande (id, numero, fournisseur_id, projet_id, statut, date_commande, date_livraison_prevue, montant_ht, created_by)
        VALUES (?, ?, ?, ?, ?, datetime('now', '-20 days'), ${deliveryDate}, ?, ?)`,
        [id, `BC-2026-${String(i).padStart(3, '0')}`, supplierId, projIds['PROJ-SSR'], status, 500000 + i * 10000, adminId]);
      
      // Lignes de commande
      const art = artIds[i % artIds.length];
      await query(`INSERT INTO bons_commande_lignes (id, commande_id, article_id, description, quantite_commandee, prix_unitaire, unite_mesure)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), id, art.id, art.des, 100, art.price, art.unit]);
    }

    // 6. STOCKS
    console.log('  - Génération des stocks...');
    const magasins = [
      { code: 'MAG-CSO', nom: 'Magasin Central CSO', site: 'CSO' },
      { code: 'MAG-BOBO', nom: 'Magasin Bobo', site: 'BOBO' },
    ];
    const magIds = [];
    for (const m of magasins) {
      const id = uuidv4();
      await query(`INSERT INTO magasins (id, code, nom, site_id, actif) VALUES (?, ?, ?, ?, 1)`, [id, m.code, m.nom, siteIds[m.site]]);
      magIds.push(id);
    }

    for (const magId of magIds) {
      for (let i = 0; i < artIds.length; i++) {
        const art = artIds[i];
        const stockId = uuidv4();
        // Créer des situations de rupture et d'alerte
        let qty = 500 + Math.random() * 1000;
        if (i === 0) qty = 0; // Rupture
        if (i === 1) qty = 5; // Sous stock mini (10)

        await query(`INSERT INTO stocks (id, article_id, magasin_id, quantite, stock_min, cump, valeur_totale)
          VALUES (?, ?, ?, ?, 10, ?, ?)`, [stockId, art.id, magId, qty, art.price, qty * art.price]);
        
        // Créer un lot pour le stock
        if (qty > 0) {
          const lotId = uuidv4();
          const peremption = i === 2 ? "date('now', '+5 days')" : "date('now', '+1 year')"; // Proche péremption
          await query(`INSERT INTO lots (id, article_id, magasin_id, numero_lot, quantite, date_peremption, prix_unitaire, statut)
            VALUES (?, ?, ?, ?, ?, ${peremption}, ?, 'disponible')`, [lotId, art.id, magId, `LOT-${art.code}-${i}`, qty, art.price]);
        }

        // Alertes automatiques (selon les cas ci-dessus)
        if (qty === 0) {
          await query(`INSERT INTO alertes_stock (id, type_alerte, article_id, magasin_id, message, statut)
            VALUES (?, 'rupture', ?, ?, ?, 'active')`, [uuidv4(), art.id, magId, `Rupture totale de ${art.des}`]);
        } else if (qty < 10) {
          await query(`INSERT INTO alertes_stock (id, type_alerte, article_id, magasin_id, message, statut)
            VALUES (?, 'stock_min', ?, ?, ?, 'active')`, [uuidv4(), art.id, magId, `Stock critique pour ${art.des}`]);
        }
      }
    }

    // 7. ÉQUIPEMENTS & FLOTTE
    console.log('  - Génération de la flotte et équipements...');
    const catEquip = uuidv4();
    await query(`INSERT INTO categories_equipement (id, code, libelle, type_equipement) VALUES (?, 'VEH', 'Véhicules', 'flotte')`, [catEquip]);
    
    const vehicles = [
      { immat: '11-JJ-1234', brand: 'TOYOTA', model: 'Hilux', year: 2022 },
      { immat: '11-KK-5678', brand: 'TOYOTA', model: 'Land Cruiser', year: 2021 },
      { immat: '11-LL-9012', brand: 'YAMAHA', model: 'AG 100', year: 2023 },
    ];

    for (const v of vehicles) {
      const eqId = uuidv4();
      await query(`INSERT INTO equipements (id, code_etiquette, designation, categorie_id, marque, modele, statut, valeur_achat, date_acquisition, site_id)
        VALUES (?, ?, ?, ?, ?, ?, 'en_service', 15000000, '2022-01-01', ?)`, 
        [eqId, `MSI-EQ-${v.immat}`, `Véhicule ${v.brand} ${v.model}`, catEquip, v.brand, v.model, siteIds['CSO']]);
      
      const vId = uuidv4();
      await query(`INSERT INTO vehicules (id, equipement_id, immatriculation, type_vehicule, marque, modele, actif, kilometrage_actuel)
        VALUES (?, ?, ?, '4x4', ?, ?, 1, 45000)`, [vId, eqId, v.immat, v.brand, v.model]);
      
      // Missions
      await query(`INSERT INTO missions (id, numero, vehicule_id, destination, date_depart, statut, created_by)
        VALUES (?, ?, ?, 'Kaya', datetime('now', '-1 day'), 'en_cours', ?)`, [uuidv4(), `MISS-${v.immat}-1`, vId, adminId]);
      
      // Carburant
      await query(`INSERT INTO approvisionnements_carburant (id, vehicule_id, quantite_litres, montant_total, date_approvisionnement)
        VALUES (?, ?, 50, 32500, date('now'))`, [uuidv4(), vId]);
      
      // Maintenances
      await query(`INSERT INTO maintenances (id, vehicule_id, type_maintenance, description, date_realisation, montant)
        VALUES (?, ?, 'Vidange', 'Entretien périodique 45k km', date('now', '-1 month'), 75000)`, [uuidv4(), vId]);
    }

    // Incidents
    const vInc = (await query("SELECT id FROM vehicules LIMIT 1")).rows[0].id;
    await query(`INSERT INTO incidents_vehicule (id, vehicule_id, type_incident, date_incident, description, statut, saisi_par)
      VALUES (?, ?, 'Accident léger', date('now', '-5 days'), 'Choc arrière en ville', 'ouvert', ?)`, [uuidv4(), vInc, adminId]);

    saveDatabase();
    console.log('✅ Seed de données démo ULTIME V2 terminé ! Dashboard dense garanti.');
    return true;
  } catch (err) {
    console.error('Erreur détaillée seed demo data:', err);
    throw err;
  }
}

module.exports = seedDemoDataLogic;
