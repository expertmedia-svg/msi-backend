const { query, saveDatabase, transaction } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function seedDemoDataLogic() {
  try {
    console.log('🌱 Lancement du seed de données démo ULTIME V2...');

    // 1. Nettoyage (Ordre important pour les FK)
    const tables = [
      'alertes_stock', 'maintenances', 'incidents_vehicule', 'approvisionnements_carburant', 
      'fiches_suivi_journalier', 'missions', 'vehicules', 'equipements_affectations', 
      'equipements_sorties', 'equipements', 'categories_equipement', 'inventaires_lignes', 'inventaires', 
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
    const lbIds = {}; // Map of project code -> array of budget line IDs
    const deviseId = (await query("SELECT id FROM devises WHERE code = 'FCFA'")).rows[0]?.id;

    for (const p of projects) {
      const id = uuidv4();
      await query(`INSERT INTO projets (id, code, nom, bailleur_id, budget_total, devise_id, statut) VALUES (?, ?, ?, ?, ?, ?, 'actif')`, 
        [id, p.code, p.nom, bailleurIds[p.bailleur], p.budget, deviseId]);
      projIds[p.code] = id;
      
      // Lignes budgétaires
      const lbId1 = uuidv4();
      const lbId2 = uuidv4();
      await query(`INSERT INTO lignes_budgetaires (id, projet_id, code, libelle, budget, depense) VALUES (?, ?, '6011', 'Achat Médicaments', ?, ?)`, [lbId1, id, p.budget * 0.6, p.budget * 0.15]);
      await query(`INSERT INTO lignes_budgetaires (id, projet_id, code, libelle, budget, depense) VALUES (?, ?, '6012', 'Consommables', ?, ?)`, [lbId2, id, p.budget * 0.3, p.budget * 0.08]);
      lbIds[p.code] = [lbId1, lbId2];
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
    const daIds = [];
    const statusesDA = ['brouillon', 'soumis', 'en_validation', 'approuve', 'rejete'];
    for (let i = 1; i <= 15; i++) {
      const id = uuidv4();
      const status = statusesDA[i % statusesDA.length];
      const montant = 100000 + Math.random() * 2000000;
      const projCode = i % 2 === 0 ? 'PROJ-SSR' : 'PROJ-PF';
      const lbId = lbIds[projCode][i % 2];
      
      await query(`INSERT INTO demandes_achat (id, numero, titre, demandeur_id, site_id, projet_id, ligne_budgetaire_id, statut, montant_estime, priorite, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-${i} days'))`,
        [id, `DA-2026-${String(i).padStart(3, '0')}`, `Besoin Matériel ${i}`, adminId, siteIds['CSO'], projIds[projCode], lbId, status, montant, i % 5 === 0 ? 'critique' : i % 3 === 0 ? 'urgente' : 'normale']);
      
      daIds.push(id);
      
      // Lignes pour chaque DA
      for (let j = 0; j < 2; j++) {
        const art = artIds[Math.floor(Math.random() * artIds.length)];
        await query(`INSERT INTO demandes_achat_lignes (id, demande_id, article_id, description, quantite, unite_mesure, prix_unitaire_estime)
          VALUES (?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), id, art.id, art.des, 10 + j * 5, art.unit, art.price]);
      }
    }

    // BCs (Bons de Commande)
    const bcIds = [];
    const statusesBC = ['brouillon', 'confirme', 'en_cours', 'livre_partiel', 'livre_total'];
    for (let i = 1; i <= 10; i++) {
      const id = uuidv4();
      const status = statusesBC[i % statusesBC.length];
      const supplierId = supplierIds[i % supplierIds.length];
      const deliveryDate = i < 5 ? "datetime('now', '-2 days')" : "datetime('now', '+10 days')"; // Certains en retard
      const projCode = i % 2 === 0 ? 'PROJ-SSR' : 'PROJ-PF';
      const lbId = lbIds[projCode][i % 2];
      const linkedDaId = daIds[(i - 1) % daIds.length];

      await query(`INSERT INTO bons_commande (id, numero, demande_achat_id, fournisseur_id, projet_id, ligne_budgetaire_id, statut, date_commande, date_livraison_prevue, montant_ht, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-20 days'), ${deliveryDate}, ?, ?)`,
        [id, `BC-2026-${String(i).padStart(3, '0')}`, linkedDaId, supplierId, projIds[projCode], lbId, status, 500000 + i * 10000, adminId]);
      
      bcIds.push(id);

      // Lignes de commande
      const art = artIds[i % artIds.length];
      await query(`INSERT INTO bons_commande_lignes (id, commande_id, article_id, description, quantite_commandee, prix_unitaire, unite_mesure)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [uuidv4(), id, art.id, art.des, 100, art.price, art.unit]);
    }

    // 6. STOCKS
    console.log('  - Génération des magasins et emplacements...');
    const magasins = [
      { code: 'MAG-CSO', nom: 'Magasin Central CSO', site: 'CSO' },
      { code: 'MAG-BOBO', nom: 'Magasin Bobo', site: 'BOBO' },
    ];
    const magIds = [];
    const magMap = {};
    for (const m of magasins) {
      const id = uuidv4();
      await query(`INSERT INTO magasins (id, code, nom, site_id, actif) VALUES (?, ?, ?, ?, 1)`, [id, m.code, m.nom, siteIds[m.site]]);
      magIds.push(id);
      magMap[m.code] = id;
    }

    // Emplacements
    const empIds = {};
    const csoEmpId = uuidv4();
    await query(`INSERT INTO emplacements (id, magasin_id, code, zone, allee, etagere, niveau, actif) VALUES (?, ?, 'A1-1', 'A', '1', '1', '1', 1)`, [csoEmpId, magMap['MAG-CSO']]);
    empIds['MAG-CSO'] = csoEmpId;

    const boboEmpId = uuidv4();
    await query(`INSERT INTO emplacements (id, magasin_id, code, zone, allee, etagere, niveau, actif) VALUES (?, ?, 'B1-1', 'B', '1', '1', '1', 1)`, [boboEmpId, magMap['MAG-BOBO']]);
    empIds['MAG-BOBO'] = boboEmpId;

    console.log('  - Génération des stocks, lots et alertes...');
    for (const magId of magIds) {
      const empId = magId === magMap['MAG-CSO'] ? empIds['MAG-CSO'] : empIds['MAG-BOBO'];
      for (let i = 0; i < artIds.length; i++) {
        const art = artIds[i];
        const stockId = uuidv4();
        // Créer des situations de rupture et d'alerte
        let qty = 500 + Math.random() * 1000;
        if (i === 0) qty = 0; // Rupture
        if (i === 1) qty = 5; // Sous stock mini (10)

        await query(`INSERT INTO stocks (id, article_id, magasin_id, emplacement_id, quantite, stock_min, cump, valeur_totale)
          VALUES (?, ?, ?, ?, ?, 10, ?, ?)`, [stockId, art.id, magId, empId, qty, art.price, qty * art.price]);
        
        // Créer un lot pour le stock
        if (qty > 0) {
          const lotId = uuidv4();
          const peremption = i === 2 ? "date('now', '+5 days')" : "date('now', '+1 year')"; // Proche péremption
          await query(`INSERT INTO lots (id, article_id, magasin_id, emplacement_id, numero_lot, quantite, date_peremption, prix_unitaire, statut)
            VALUES (?, ?, ?, ?, ?, ?, ${peremption}, ?, 'disponible')`, [lotId, art.id, magId, empId, `LOT-${art.code}-${i}`, qty, art.price]);
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
      { immat: '11-JJ-1234', brand: 'TOYOTA', model: 'Hilux', year: 2022, exp: '-15 days' }, // expired docs to test alerts
      { immat: '11-KK-5678', brand: 'TOYOTA', model: 'Land Cruiser', year: 2021, exp: '+10 days' }, // expiring soon
      { immat: '11-LL-9012', brand: 'YAMAHA', model: 'AG 100', year: 2023, exp: '+250 days' }, // safe
    ];

    const vehicleIds = [];
    const missionIds = [];
    for (const v of vehicles) {
      const eqId = uuidv4();
      await query(`INSERT INTO equipements (id, code_etiquette, designation, categorie_id, marque, modele, statut, valeur_achat, date_acquisition, site_id)
        VALUES (?, ?, ?, ?, ?, ?, 'en_service', 15000000, '2022-01-01', ?)`, 
        [eqId, `MSI-EQ-${v.immat}`, `Véhicule ${v.brand} ${v.model}`, catEquip, v.brand, v.model, siteIds['CSO']]);
      
      const vId = uuidv4();
      // Insert with expiration dates for documentation alerts
      await query(`INSERT INTO vehicules (
        id, equipement_id, immatriculation, type_vehicule, marque, modele, actif, kilometrage_actuel,
        carte_jaune_expiration, assurance_expiration, visite_technique_expiration
      ) VALUES (?, ?, ?, '4x4', ?, ?, 1, 45000, date('now', '${v.exp}'), date('now', '${v.exp}'), date('now', '${v.exp}'))`, 
      [vId, eqId, v.immat, v.brand, v.model]);
      
      vehicleIds.push(vId);

      // Missions
      const mId = uuidv4();
      await query(`INSERT INTO missions (id, numero, vehicule_id, destination, date_depart, statut, created_by)
        VALUES (?, ?, ?, 'Kaya', datetime('now', '-1 day'), 'en_cours', ?)`, [mId, `MISS-${v.immat}-1`, vId, adminId]);
      missionIds.push(mId);

      // Carburant
      await query(`INSERT INTO approvisionnements_carburant (id, vehicule_id, quantite_litres, montant_total, date_approvisionnement)
        VALUES (?, ?, 50, 32500, date('now'))`, [uuidv4(), vId]);
      
      // Maintenances
      await query(`INSERT INTO maintenances (id, vehicule_id, type_maintenance, description, date_realisation, montant)
        VALUES (?, ?, 'Vidange', 'Entretien périodique 45k km', date('now', '-1 month'), 75000)`, [uuidv4(), vId]);
    }

    // Incidents
    const vInc = vehicleIds[0];
    await query(`INSERT INTO incidents_vehicule (id, vehicule_id, type_incident, date_incident, description, statut, saisi_par)
      VALUES (?, ?, 'Accident léger', date('now', '-5 days'), 'Choc arrière en ville', 'ouvert', ?)`, [uuidv4(), vInc, adminId]);


    // ============================================================
    // SEED DE COMPLÉTION DE TOUTES LES FONCTIONNALITÉS DE DÉMO
    // ============================================================

    // 1. RFQs & Quotes (Demandes de devis et offres fournisseurs)
    console.log('  - Génération des demandes de devis et offres...');
    const daRes = await query("SELECT id, numero FROM demandes_achat WHERE statut = 'en_validation' OR statut = 'approuve'");
    for (let i = 0; i < Math.min(5, daRes.rows.length); i++) {
      const da = daRes.rows[i];
      const ddId = uuidv4();
      await query(`INSERT INTO demandes_devis (id, numero, demande_achat_id, statut, date_limite_reponse, created_by)
        VALUES (?, ?, ?, 'termine', date('now', '+5 days'), ?)`,
        [ddId, `RFQ-2026-${String(i+1).padStart(3, '0')}`, da.id, adminId]);

      // Associer aux 2 premiers fournisseurs
      for (let j = 0; j < 2; j++) {
        const supplierId = supplierIds[j];
        const ddfId = uuidv4();
        await query(`INSERT INTO demandes_devis_fournisseurs (id, demande_devis_id, fournisseur_id, statut, date_reponse)
          VALUES (?, ?, ?, 'repondu', date('now', '-1 day'))`,
          [ddfId, ddId, supplierId]);

        const offreId = uuidv4();
        await query(`INSERT INTO offres_fournisseurs (id, ddq_fournisseur_id, delai_livraison_jours, conditions_paiement, validite_offre_jours, note_technique, soumis_le)
          VALUES (?, ?, 5, '30 jours fin de mois', 90, 'Conforme aux spécifications techniques', datetime('now', '-1 day'))`,
          [offreId, ddfId]);

        // Lignes de l'offre
        const daLines = await query("SELECT id, article_id, quantite, prix_unitaire_estime FROM demandes_achat_lignes WHERE demande_id = ?", [da.id]);
        for (const line of daLines.rows) {
          await query(`INSERT INTO offres_lignes (id, offre_id, demande_ligne_id, quantite_disponible, prix_unitaire, devise_id, prix_unitaire_fcfa)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), offreId, line.id, line.quantite, line.prix_unitaire_estime * 0.95, deviseId, line.prix_unitaire_estime * 0.95]);
        }
      }
    }

    // 2. Receptions & Receptions_lignes (Livraisons conformes et partielles)
    console.log('  - Génération des réceptions de matériel...');
    const bcRes = await query("SELECT id, numero, fournisseur_id FROM bons_commande WHERE statut = 'livre_total' OR statut = 'livre_partiel'");
    const receptionIds = [];
    for (let i = 0; i < bcRes.rows.length; i++) {
      const bc = bcRes.rows[i];
      const receptionId = uuidv4();
      const isPartiel = bc.numero.includes('002') || bc.numero.includes('004');
      
      await query(`INSERT INTO receptions (id, numero, commande_id, site_id, date_reception, statut, bon_livraison_numero, recu_par)
        VALUES (?, ?, ?, ?, date('now', '-2 days'), ?, ?, ?)`,
        [receptionId, `REC-2026-${String(i+1).padStart(3, '0')}`, bc.id, siteIds['CSO'], isPartiel ? 'partiel' : 'conforme', `BL-BC-${i+1}`, adminId]);

      receptionIds.push(receptionId);

      // Lignes de réception
      const lines = await query("SELECT id, article_id, quantite_commandee, prix_unitaire, unite_mesure FROM bons_commande_lignes WHERE commande_id = ?", [bc.id]);
      for (const line of lines.rows) {
        const qtyRec = isPartiel ? line.quantite_commandee / 2 : line.quantite_commandee;
        await query(`INSERT INTO receptions_lignes (id, reception_id, commande_ligne_id, article_id, quantite_recue, quantite_acceptee, quantite_rejetee, numero_lot, date_peremption)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?, date('now', '+1 year'))`,
          [uuidv4(), receptionId, line.id, line.article_id, qtyRec, qtyRec, `LOT-${bc.numero}-${i}`]);
      }
    }

    // 3. Inventaires & Inventaires_lignes (Fiches de stocktakes)
    console.log('  - Génération des inventaires...');
    for (let i = 0; i < magIds.length; i++) {
      const magId = magIds[i];
      const invId = uuidv4();
      await query(`INSERT INTO inventaires (id, numero, magasin_id, type_inventaire, statut, date_debut, cree_par)
        VALUES (?, ?, ?, 'annuel', 'en_cours', datetime('now', '-1 day'), ?)`,
        [invId, `INV-2026-${String(i+1).padStart(3, '0')}`, magId, adminId]);

      const stocks = await query("SELECT article_id, quantite FROM stocks WHERE magasin_id = ?", [magId]);
      for (const s of stocks.rows) {
        await query(`INSERT INTO inventaires_lignes (id, inventaire_id, article_id, quantite_theorique, quantite_comptee, ecart, commentaire, compte_par)
          VALUES (?, ?, ?, ?, ?, 0, 'Conforme au stock physique', ?)`,
          [uuidv4(), invId, s.article_id, s.quantite, s.quantite, adminId]);
      }
    }

    // 4. Equipements_affectations (Historique des affectations)
    console.log('  - Génération des affectations d\'équipements...');
    const eqRes = await query("SELECT id FROM equipements");
    for (let i = 0; i < eqRes.rows.length; i++) {
      const eq = eqRes.rows[i];
      await query(`INSERT INTO equipements_affectations (id, equipement_id, utilisateur_id, site_id, localisation_physique, date_affectation, statut, affecter_par)
        VALUES (?, ?, ?, ?, 'Bureaux Administratifs', date('now', '-1 month'), 'actif', ?)`,
        [uuidv4(), eq.id, adminId, siteIds['CSO'], adminId]);
    }

    // 5. Fiches_suivi_journalier (Suivi quotidien de la flotte)
    console.log('  - Génération des fiches de suivi journalier des véhicules...');
    for (let i = 0; i < vehicleIds.length; i++) {
      const v = vehicleIds[i];
      const mId = missionIds[i] || null;
      await query(`INSERT INTO fiches_suivi_journalier (id, vehicule_id, date_fiche, mission_id, etat_general, niveaux_huile, niveaux_eau, pression_pneus, freins_ok, eclairage_ok, essuie_glaces_ok, carrosserie_ok, km_debut, km_fin, carburant_debut_litres, rempli_par)
        VALUES (?, ?, date('now'), ?, 'excellent', 1, 1, 1, 1, 1, 1, 1, 45000, 45150, 45, ?)`,
        [uuidv4(), v, mId, adminId]);
    }

    // 6. Documents fournisseurs (Compliance / Vetting)
    console.log('  - Génération des documents de conformité fournisseurs...');
    for (const supplierId of supplierIds) {
      await query(`INSERT INTO fournisseurs_documents (id, fournisseur_id, type_document, nom_fichier, chemin_fichier, date_expiration, uploaded_by)
        VALUES (?, ?, 'nif', 'Certificat_NIF_2026.pdf', '/uploads/documents/nif.pdf', date('now', '+6 months'), ?)`,
        [uuidv4(), supplierId, adminId]);
      await query(`INSERT INTO fournisseurs_documents (id, fournisseur_id, type_document, nom_fichier, chemin_fichier, date_expiration, uploaded_by)
        VALUES (?, ?, 'rccm', 'RCCM_Registre_Commerce.pdf', '/uploads/documents/rccm.pdf', date('now', '+1 year'), ?)`,
        [uuidv4(), supplierId, adminId]);
    }

    // 7. Évaluations fournisseurs
    console.log('  - Génération des évaluations fournisseurs...');
    for (let i = 0; i < supplierIds.length; i++) {
      const supplierId = supplierIds[i];
      const linkedBcId = bcIds[i % bcIds.length];
      await query(`INSERT INTO fournisseurs_evaluations (id, fournisseur_id, commande_id, note_delais, note_qualite, note_conformite, note_communication, note_globale, commentaire, evalue_par)
        VALUES (?, ?, ?, 4.5, 4.0, 4.5, 4.0, 4.25, 'Livraison dans les délais. Produits conformes aux normes de qualité de MSI.', ?)`,
        [uuidv4(), supplierId, linkedBcId, adminId]);
    }

    // 8. Mouvements de stock historiques
    console.log('  - Génération des mouvements de stock (Journal)...');
    const firstMagId = magIds[0];
    const secondMagId = magIds[1];
    for (let i = 0; i < Math.min(5, artIds.length); i++) {
      const art = artIds[i];
      // Entrée historique
      await query(`INSERT INTO mouvements_stock (id, type_mouvement, article_id, magasin_dest_id, quantite, prix_unitaire, valeur, reference_document, motif, saisi_par, created_at)
        VALUES (?, 'entree', ?, ?, 500, ?, ?, 'REC-2026-001', 'Réception initiale achat', ?, datetime('now', '-5 days'))`,
        [uuidv4(), art.id, firstMagId, art.price, 500 * art.price, adminId]);
      
      // Sortie historique
      await query(`INSERT INTO mouvements_stock (id, type_mouvement, article_id, magasin_source_id, quantite, prix_unitaire, valeur, reference_document, motif, saisi_par, created_at)
        VALUES (?, 'sortie', ?, ?, 20, ?, ?, 'DIST-2026-001', 'Distribution clinique terrain', ?, datetime('now', '-2 days'))`,
        [uuidv4(), art.id, firstMagId, art.price, 20 * art.price, adminId]);

      // Transfert historique
      await query(`INSERT INTO mouvements_stock (id, type_mouvement, article_id, magasin_source_id, magasin_dest_id, quantite, prix_unitaire, valeur, reference_document, motif, saisi_par, created_at)
        VALUES (?, 'transfert', ?, ?, ?, ?, ?, ?, 'TRANS-2026-001', 'Approvisionnement Bobo', ?, datetime('now', '-1 day'))`,
        [uuidv4(), art.id, firstMagId, secondMagId, 50, art.price, 50 * art.price, adminId]);
    }

    // 9. Équipements Sorties (Decommissioning / Cessions)
    console.log('  - Génération des sorties d\'actifs...');
    const decommissionedEqId = uuidv4();
    await query(`INSERT INTO equipements (id, code_etiquette, designation, categorie_id, marque, modele, statut, valeur_achat, date_acquisition, site_id)
      VALUES (?, 'MSI-EQ-OLD01', 'Ancien Laptop Dell L5400', ?, 'DELL', 'Latitude 5400', 'sorti', 650000, '2020-05-10', ?)`,
      [decommissionedEqId, catEquip, siteIds['CSO']]);
    await query(`INSERT INTO equipements_sorties (id, equipement_id, type_sortie, date_sortie, valeur_cession, beneficiaire, motif, created_by)
      VALUES (?, ?, 'declassement', date('now', '-2 months'), 0, 'MSI Recycling', 'Obsolescence technique et panne carte mère', ?)`,
      [uuidv4(), decommissionedEqId, adminId]);

    saveDatabase();
    console.log('✅ Seed de données démo ULTIME V2 terminé ! Dashboard dense garanti.');
    return true;
  } catch (err) {
    console.error('Erreur détaillée seed demo data:', err);
    throw err;
  }
}

module.exports = seedDemoDataLogic;
