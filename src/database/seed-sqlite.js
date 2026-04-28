// src/database/seed-sqlite.js
// Données de démonstration pour tests / pilote - Version SQLite

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../data', process.env.DB_NAME || 'msi_gestion.db');

async function seed() {
  try {
    console.log('🌱 Insertion des données de démonstration...');
    const db = new sqlite3.Database(dbPath);
    db.run('PRAGMA foreign_keys = ON');

    // ── Mettre à jour le mot de passe admin + créer compte demo ─
    const adminHash = await bcrypt.hash('Admin@MSI2026!', 12);
    const demoHash  = await bcrypt.hash('mariestop', 12);

    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE utilisateurs SET mot_de_passe_hash = ? WHERE email = 'admin@mariestopes-bf.org'`,
        [adminHash],
        function(err) {
          if (err) return reject(err);
          console.log('✅ Mot de passe admin mis à jour : Admin@MSI2026!');

          // Insérer ou mettre à jour le compte demo adminmsi
          db.run(
            `INSERT INTO utilisateurs (id, nom, prenom, email, mot_de_passe_hash, role_id, actif, premiere_connexion, created_at, updated_at)
             SELECT ?, 'Admin', 'MSI', 'adminmsi@mariestopes-bf.org', ?, r.id, 1, 0, datetime('now'), datetime('now')
             FROM roles r WHERE r.code = 'admin'
             ON CONFLICT(email) DO UPDATE SET mot_de_passe_hash = excluded.mot_de_passe_hash, premiere_connexion = 0`,
            [uuidv4(), demoHash],
            function(err) {
              if (err) console.warn('⚠️ Compte demo adminmsi :', err.message);
              else console.log('✅ Compte demo : adminmsi@mariestopes-bf.org / mariestop');
            }
          );

          // ── Sites ─────────────────────────────────────────────────
          const sites = [
            { code: 'CSO',       nom: 'Centre de Services Ouagadougou', type: 'central',       ville: 'Ouagadougou' },
            { code: 'MS_LADIES', nom: 'MS Ladies Ouagadougou',          type: 'point_service', ville: 'Ouagadougou' },
            { code: 'MAG_CENT',  nom: 'Magasin Central Ouagadougou',    type: 'central',       ville: 'Ouagadougou' },
            { code: 'BOBO',      nom: 'Centre Bobo-Dioulasso',          type: 'regional',      ville: 'Bobo-Dioulasso' },
            { code: 'KOUDOUGOU', nom: 'Centre Koudougou',               type: 'regional',      ville: 'Koudougou' },
          ];
          
          const insertSiteStmt = db.prepare(`
            INSERT OR IGNORE INTO sites (id, code, nom, type, ville, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
          `);

          db.serialize(() => {
            for (const s of sites) {
              insertSiteStmt.run(uuidv4(), s.code, s.nom, s.type, s.ville);
            }
            insertSiteStmt.finalize();
            
            console.log(`✅ ${sites.length} sites insérés`);

            // Récupère les IDs des sites pour la suite
            db.all('SELECT id, code FROM sites', (err, sitesRows) => {
              if (err) return reject(err);
              
              const siteIds = {};
              sitesRows.forEach(s => { siteIds[s.code] = s.id; });

              // Continue avec les bailleurs
              continueSeed(db, siteIds);
            });
          });
        }
      );
    });

    function continueSeed(db, siteIds) {
      db.serialize(() => {
        // ── Bailleurs ─────────────────────────────────────────────
        const bailleurs = [
          { code: 'BMGF',   nom: 'Bill & Melinda Gates Foundation',       acronyme: 'BMGF' },
          { code: 'USAID',  nom: 'US Agency for International Development', acronyme: 'USAID' },
          { code: 'GAVI',   nom: 'Gavi, the Vaccine Alliance',             acronyme: 'GAVI' },
          { code: 'MSI_HQ', nom: 'MSI Headquarters London',               acronyme: 'MSI HQ' },
          { code: 'UNFPA',  nom: 'United Nations Population Fund',         acronyme: 'UNFPA' },
        ];
        
        const insertBailleur = db.prepare(`
          INSERT OR IGNORE INTO bailleurs (id, code, nom, acronyme, actif, created_at, updated_at)
          VALUES (?, ?, ?, ?, true, datetime('now'), datetime('now'))
        `);

        for (const b of bailleurs) {
          insertBailleur.run(uuidv4(), b.code, b.nom, b.acronyme);
        }
        insertBailleur.finalize();
        console.log(`✅ ${bailleurs.length} bailleurs insérés`);

        // Récupère les IDs des bailleurs et devises
        db.all('SELECT id, code FROM bailleurs', (err, bailleursRows) => {
          if (err) throw err;
          
          const bailleurIds = {};
          bailleursRows.forEach(b => { bailleurIds[b.code] = b.id; });

          db.get("SELECT id FROM devises WHERE code = 'FCFA'", (err, deviseRow) => {
            if (err) throw err;
            
            const deviseId = deviseRow?.id;

            // ── Projets ───────────────────────────────────────────────
            const projets = [
              { code: 'PROJ-2026-001', nom: 'Programme SSR 2026 – USAID',    bailleur: 'USAID',  budget: 500000000 },
              { code: 'PROJ-2026-002', nom: 'Planification Familiale – BMGF', bailleur: 'BMGF',  budget: 300000000 },
              { code: 'PROJ-2026-003', nom: 'Soins Maternels – UNFPA',        bailleur: 'UNFPA', budget: 200000000 },
            ];

            const insertProjet = db.prepare(`
              INSERT OR IGNORE INTO projets (id, code, nom, bailleur_id, date_debut, date_fin, budget_total, devise_id, created_at, updated_at)
              VALUES (?, ?, ?, ?, '2026-01-01', '2026-12-31', ?, ?, datetime('now'), datetime('now'))
            `);

            for (const p of projets) {
              insertProjet.run(uuidv4(), p.code, p.nom, bailleurIds[p.bailleur], p.budget, deviseId);
            }
            insertProjet.finalize();
            console.log(`✅ ${projets.length} projets insérés`);

            // Continua avec les catégories
            insertCategories(db);
          });
        });
      });
    }

    function insertCategories(db) {
      // ── Catégories de marché ──────────────────────────────────
      const cats = [
        { code: 'PHARMA',   libelle: 'Produits pharmaceutiques' },
        { code: 'CONSOMM',  libelle: 'Consommables médicaux' },
        { code: 'EQUIPMED', libelle: 'Équipements médicaux' },
        { code: 'BUREAU',   libelle: 'Fournitures de bureau' },
        { code: 'INFORM',   libelle: 'Informatique et électronique' },
        { code: 'VEHICULE', libelle: 'Véhicules et pièces' },
        { code: 'CARBURANT',libelle: 'Carburant et lubrifiants' },
        { code: 'SERVICE',  libelle: 'Prestations de services' },
      ];

      const insertCat = db.prepare(`
        INSERT OR IGNORE INTO categories_marche (id, code, libelle, description)
        VALUES (?, ?, ?, NULL)
      `);

      db.serialize(() => {
        for (const c of cats) {
          insertCat.run(uuidv4(), c.code, c.libelle);
        }
        insertCat.finalize();
        console.log(`✅ ${cats.length} catégories de marché insérées`);

        // Continue avec les articles
        insertArticles(db);
      });
    }

    function insertArticles(db) {
      const articles = [
        { code: 'ART-001', designation: 'Contraceptifs oraux combinés (plaquette 28)',        cat: 'PHARMA',  um: 'plaquette', prix: 1500,  pharma: 1 },
        { code: 'ART-002', designation: 'Implant contraceptif Nexplanon',                     cat: 'PHARMA',  um: 'unité',     prix: 8500,  pharma: 1 },
        { code: 'ART-003', designation: 'DIU Cuivre 380A',                                    cat: 'PHARMA',  um: 'unité',     prix: 4200,  pharma: 1 },
        { code: 'ART-004', designation: 'Préservatifs masculins (boîte 100)',                  cat: 'PHARMA',  um: 'boîte',     prix: 3500,  pharma: 1 },
        { code: 'ART-005', designation: 'Misoprostol 200mcg comprimé',                        cat: 'PHARMA',  um: 'comprimé',  prix: 450,   pharma: 1 },
        { code: 'ART-006', designation: 'Lidocaïne 1% injectable (flacon 50ml)',              cat: 'PHARMA',  um: 'flacon',    prix: 2800,  pharma: 1 },
        { code: 'ART-007', designation: 'Gants d\'examen latex (boîte 100)',                  cat: 'CONSOMM', um: 'boîte',     prix: 6500,  pharma: 0 },
        { code: 'ART-008', designation: 'Seringues 5ml (boîte 100)',                          cat: 'CONSOMM', um: 'boîte',     prix: 4800,  pharma: 0 },
        { code: 'ART-009', designation: 'Tests grossesse urinaire (boîte 50)',                cat: 'PHARMA',  um: 'boîte',     prix: 12000, pharma: 1 },
        { code: 'ART-010', designation: 'Alcool éthylique 70° (litre)',                       cat: 'CONSOMM', um: 'litre',     prix: 1800,  pharma: 0 },
        { code: 'ART-011', designation: 'Papier d\'imprimante A4 (rame 500)',                 cat: 'BUREAU',  um: 'rame',      prix: 2500,  pharma: 0 },
        { code: 'ART-012', designation: 'Cartouche d\'encre HP noir',                        cat: 'INFORM',  um: 'unité',     prix: 18000, pharma: 0 },
      ];

      const insertArticle = db.prepare(`
        INSERT OR IGNORE INTO articles (id, code, designation, categorie, unite_mesure, prix_unitaire_moyen, est_pharmaceutique, actif, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, true, datetime('now'), datetime('now'))
      `);

      db.serialize(() => {
        for (const a of articles) {
          insertArticle.run(uuidv4(), a.code, a.designation, a.cat, a.um, a.prix, a.pharma);
        }
        insertArticle.finalize();
        console.log(`✅ ${articles.length} articles insérés`);

        // Continue avec magasins
        insertMagasinsAndMore(db);
      });
    }

    function insertMagasinsAndMore(db) {
      db.all('SELECT id, code FROM sites', (err, sitesRows) => {
        if (err) throw err;
        
        const siteIds = {};
        sitesRows.forEach(s => { siteIds[s.code] = s.id; });

        const magasins = [
          { code: 'MAG-CENT', nom: 'Magasin Central Ouagadougou', type: 'central',       site: 'MAG_CENT' },
          { code: 'MAG-CSO',  nom: 'Stock CSO Ouagadougou',       type: 'point_service', site: 'CSO'      },
          { code: 'MAG-BOBO', nom: 'Magasin Régional Bobo',       type: 'regional',      site: 'BOBO'     },
        ];

        const insertMagasin = db.prepare(`
          INSERT OR IGNORE INTO magasins (id, code, nom, type, site_id, actif, created_at)
          VALUES (?, ?, ?, ?, ?, true, datetime('now'))
        `);

        db.serialize(() => {
          for (const m of magasins) {
            insertMagasin.run(uuidv4(), m.code, m.nom, m.type, siteIds[m.site]);
          }
          insertMagasin.finalize();
          console.log(`✅ ${magasins.length} magasins insérés`);

          // Continue avec fournisseurs et etc.
          insertFournisseursAndMore(db);
        });
      });
    }

    function insertFournisseursAndMore(db) {
      db.all('SELECT id, code FROM categories_marche', (err, catsRows) => {
        if (err) throw err;
        
        const catIds = {};
        catsRows.forEach(c => { catIds[c.code] = c.id; });

        const fournisseurs = [
          {
            code: 'FOUR-2026-0001', nom: 'Pharmacie Centrale du Burkina', categorie: 'PHARMA',
            ville: 'Ouagadougou', telephone: '+226 25 30 00 00',
            email: 'contact@pcb.bf', contact_nom: 'Dr Koné Amadou', note: 4.5
          },
          {
            code: 'FOUR-2026-0002', nom: 'Société Ouest Africaine de Médicaments (SOAM)', categorie: 'PHARMA',
            ville: 'Ouagadougou', telephone: '+226 25 31 11 11',
            email: 'info@soam-bf.com', contact_nom: 'Mme Traoré Fatima', note: 4.2
          },
          {
            code: 'FOUR-2026-0003', nom: 'Bureau Sahel Fournitures', categorie: 'BUREAU',
            ville: 'Ouagadougou', telephone: '+226 25 33 22 22',
            email: 'ventes@bsf.bf', contact_nom: 'M. Ouédraogo Jean', note: 3.8
          },
          {
            code: 'FOUR-2026-0004', nom: 'Total Energies Burkina Faso', categorie: 'CARBURANT',
            ville: 'Ouagadougou', telephone: '+226 25 30 50 00',
            email: 'b2b@total.bf', contact_nom: 'Direction Commerciale', note: 4.7
          },
        ];

        const insertFournisseur = db.prepare(`
          INSERT OR IGNORE INTO fournisseurs 
            (id, code, nom, categorie_id, ville, pays, telephone, email, contact_nom, note_globale, actif, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'Burkina Faso', ?, ?, ?, ?, true, datetime('now'), datetime('now'))
        `);

        db.serialize(() => {
          for (const f of fournisseurs) {
            insertFournisseur.run(uuidv4(), f.code, f.nom, catIds[f.categorie], f.ville, f.telephone, f.email, f.contact_nom, f.note);
          }
          insertFournisseur.finalize();
          console.log(`✅ ${fournisseurs.length} fournisseurs insérés`);

          // Finalize
          finalizeAndExit(db);
        });
      });
    }

    function finalizeAndExit(db) {
      console.log('');
      console.log('✅ Seed SQLite terminé avec succès!');
      console.log('');
      console.log('🔐 Identifiants de démo :');
      console.log('');
      console.log('  admin@mariestopes-bf.org            → Admin@MSI2026!(Administrateur)');
      console.log('  a.ouedraogo@mariestopes-bf.org      → Log@2026!  (Responsable logistique)');
      console.log('  i.compaore@mariestopes-bf.org       → Ach@2026!  (Gestionnaire achats)');
      console.log('  m.sawadogo@mariestopes-bf.org       → Mag@2026!  (Magasinier)');
      console.log('  s.tall@mariestopes-bf.org           → Equip@2026!(Équipements)');
      console.log('  f.kabore@mariestopes-bf.org         → Val@2026!  (Validateur)');
      console.log('  m.diallo@mariestopes-bf.org         → Mag2@2026! (Magasinier Bobo)');

      db.close(() => {
        process.exit(0);
      });
    }

  } catch (err) {
    console.error('❌ Erreur seed :', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

seed();

