// src/database/seed.js
// Données de démonstration pour tests / pilote

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'msi_gestion',
  user:     process.env.DB_USER     || 'msi_user',
  password: process.env.DB_PASSWORD,
});

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🌱 Insertion des données de démonstration...');
    await client.query('BEGIN');

    // ── Mettre à jour le mot de passe admin ──────────────────
    const adminHash = await bcrypt.hash('Admin@MSI2026!', 12);
    await client.query(
      `UPDATE utilisateurs SET mot_de_passe_hash = $1 WHERE email = 'admin@mariestopes-bf.org'`,
      [adminHash]
    );
    console.log('✅ Mot de passe admin mis à jour : Admin@MSI2026!');

    // ── Sites ─────────────────────────────────────────────────
    const sites = [
      { code: 'CSO',       nom: 'Centre de Services Ouagadougou', type: 'central',       ville: 'Ouagadougou' },
      { code: 'MS_LADIES', nom: 'MS Ladies Ouagadougou',          type: 'point_service', ville: 'Ouagadougou' },
      { code: 'MAG_CENT',  nom: 'Magasin Central Ouagadougou',    type: 'central',       ville: 'Ouagadougou' },
      { code: 'BOBO',      nom: 'Centre Bobo-Dioulasso',          type: 'regional',      ville: 'Bobo-Dioulasso' },
      { code: 'KOUDOUGOU', nom: 'Centre Koudougou',               type: 'regional',      ville: 'Koudougou' },
    ];
    for (const s of sites) {
      await client.query(
        `INSERT INTO sites (code, nom, type, ville) VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING`,
        [s.code, s.nom, s.type, s.ville]
      );
    }
    console.log(`✅ ${sites.length} sites insérés`);

    // ── Bailleurs ─────────────────────────────────────────────
    const bailleurs = [
      { code: 'BMGF',   nom: 'Bill & Melinda Gates Foundation',       acronyme: 'BMGF' },
      { code: 'USAID',  nom: 'US Agency for International Development', acronyme: 'USAID' },
      { code: 'GAVI',   nom: 'Gavi, the Vaccine Alliance',             acronyme: 'GAVI' },
      { code: 'MSI_HQ', nom: 'MSI Headquarters London',               acronyme: 'MSI HQ' },
      { code: 'UNFPA',  nom: 'United Nations Population Fund',         acronyme: 'UNFPA' },
    ];
    for (const b of bailleurs) {
      await client.query(
        `INSERT INTO bailleurs (code, nom, acronyme) VALUES ($1,$2,$3) ON CONFLICT (code) DO NOTHING`,
        [b.code, b.nom, b.acronyme]
      );
    }
    console.log(`✅ ${bailleurs.length} bailleurs insérés`);

    // ── Projets ───────────────────────────────────────────────
    const bailleurIds = {};
    const br = await client.query('SELECT id, code FROM bailleurs');
    br.rows.forEach(b => { bailleurIds[b.code] = b.id; });

    const deviseId = (await client.query("SELECT id FROM devises WHERE code = 'FCFA'")).rows[0]?.id;

    const projets = [
      { code: 'PROJ-2026-001', nom: 'Programme SSR 2026 – USAID',    bailleur: 'USAID',  budget: 500000000 },
      { code: 'PROJ-2026-002', nom: 'Planification Familiale – BMGF', bailleur: 'BMGF',  budget: 300000000 },
      { code: 'PROJ-2026-003', nom: 'Soins Maternels – UNFPA',        bailleur: 'UNFPA', budget: 200000000 },
    ];
    for (const p of projets) {
      await client.query(
        `INSERT INTO projets (code, nom, bailleur_id, date_debut, date_fin, budget_total, devise_id)
         VALUES ($1,$2,$3,'2026-01-01','2026-12-31',$4,$5) ON CONFLICT (code) DO NOTHING`,
        [p.code, p.nom, bailleurIds[p.bailleur], p.budget, deviseId]
      );
    }
    console.log(`✅ ${projets.length} projets insérés`);

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
    for (const c of cats) {
      await client.query(
        `INSERT INTO categories_marche (code, libelle) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING`,
        [c.code, c.libelle]
      );
    }
    console.log(`✅ ${cats.length} catégories de marché insérées`);

    // ── Articles pharmaceutiques ──────────────────────────────
    const articles = [
      { code: 'ART-001', designation: 'Contraceptifs oraux combinés (plaquette 28)',        cat: 'PHARMA',  um: 'plaquette', prix: 1500,  pharma: true },
      { code: 'ART-002', designation: 'Implant contraceptif Nexplanon',                     cat: 'PHARMA',  um: 'unité',     prix: 8500,  pharma: true },
      { code: 'ART-003', designation: 'DIU Cuivre 380A',                                    cat: 'PHARMA',  um: 'unité',     prix: 4200,  pharma: true },
      { code: 'ART-004', designation: 'Préservatifs masculins (boîte 100)',                  cat: 'PHARMA',  um: 'boîte',     prix: 3500,  pharma: true },
      { code: 'ART-005', designation: 'Misoprostol 200mcg comprimé',                        cat: 'PHARMA',  um: 'comprimé',  prix: 450,   pharma: true },
      { code: 'ART-006', designation: 'Lidocaïne 1% injectable (flacon 50ml)',              cat: 'PHARMA',  um: 'flacon',    prix: 2800,  pharma: true },
      { code: 'ART-007', designation: 'Gants d\'examen latex (boîte 100)',                  cat: 'CONSOMM', um: 'boîte',     prix: 6500,  pharma: false },
      { code: 'ART-008', designation: 'Seringues 5ml (boîte 100)',                          cat: 'CONSOMM', um: 'boîte',     prix: 4800,  pharma: false },
      { code: 'ART-009', designation: 'Tests grossesse urinaire (boîte 50)',                cat: 'PHARMA',  um: 'boîte',     prix: 12000, pharma: true },
      { code: 'ART-010', designation: 'Alcool éthylique 70° (litre)',                       cat: 'CONSOMM', um: 'litre',     prix: 1800,  pharma: false },
      { code: 'ART-011', designation: 'Papier d\'imprimante A4 (rame 500)',                 cat: 'BUREAU',  um: 'rame',      prix: 2500,  pharma: false },
      { code: 'ART-012', designation: 'Cartouche d\'encre HP noir',                        cat: 'INFORM',  um: 'unité',     prix: 18000, pharma: false },
    ];
    for (const a of articles) {
      await client.query(
        `INSERT INTO articles (code, designation, categorie, unite_mesure, prix_unitaire_moyen, est_pharmaceutique)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (code) DO NOTHING`,
        [a.code, a.designation, a.cat, a.um, a.prix, a.pharma]
      );
    }
    console.log(`✅ ${articles.length} articles insérés`);

    // ── Magasins ──────────────────────────────────────────────
    const siteIds = {};
    const sr = await client.query('SELECT id, code FROM sites');
    sr.rows.forEach(s => { siteIds[s.code] = s.id; });

    const magasins = [
      { code: 'MAG-CENT', nom: 'Magasin Central Ouagadougou', type: 'central',       site: 'MAG_CENT' },
      { code: 'MAG-CSO',  nom: 'Stock CSO Ouagadougou',       type: 'point_service', site: 'CSO'      },
      { code: 'MAG-BOBO', nom: 'Magasin Régional Bobo',       type: 'regional',      site: 'BOBO'     },
    ];
    for (const m of magasins) {
      await client.query(
        `INSERT INTO magasins (code, nom, type, site_id) VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING`,
        [m.code, m.nom, m.type, siteIds[m.site]]
      );
    }
    console.log(`✅ ${magasins.length} magasins insérés`);

    // ── Fournisseurs ──────────────────────────────────────────
    const catIds = {};
    const cr = await client.query('SELECT id, code FROM categories_marche');
    cr.rows.forEach(c => { catIds[c.code] = c.id; });

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
    for (const f of fournisseurs) {
      await client.query(
        `INSERT INTO fournisseurs
           (code, nom, categorie_id, ville, pays, telephone, email, contact_nom, note_globale)
         VALUES ($1,$2,$3,$4,'Burkina Faso',$5,$6,$7,$8)
         ON CONFLICT (code) DO NOTHING`,
        [f.code, f.nom, catIds[f.categorie], f.ville, f.telephone, f.email, f.contact_nom, f.note]
      );
    }
    console.log(`✅ ${fournisseurs.length} fournisseurs insérés`);

    // ── Catégories équipement ─────────────────────────────────
    const catsEquip = [
      { code: 'INFORM',   libelle: 'Informatique',         duree: 4,  taux: 25 },
      { code: 'MOBILIER', libelle: 'Mobilier de bureau',   duree: 10, taux: 10 },
      { code: 'MEDICAL',  libelle: 'Équipement médical',   duree: 8,  taux: 12.5 },
      { code: 'VEHICULE', libelle: 'Véhicule',             duree: 5,  taux: 20 },
      { code: 'MOTO',     libelle: 'Moto',                 duree: 5,  taux: 20 },
      { code: 'GROUPE',   libelle: 'Groupe électrogène',   duree: 10, taux: 10 },
      { code: 'CLIM',     libelle: 'Climatiseur',          duree: 8,  taux: 12.5 },
    ];
    for (const c of catsEquip) {
      await client.query(
        `INSERT INTO categories_equipement (code, libelle, type_equipement, duree_amortissement_ans, taux_amortissement)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code) DO NOTHING`,
        [c.code, c.libelle, c.code.toLowerCase(), c.duree, c.taux]
      );
    }
    console.log(`✅ ${catsEquip.length} catégories équipement insérées`);

    // ── Utilisateurs démo ─────────────────────────────────────
    const rolesIds = {};
    const rr = await client.query('SELECT id, code FROM roles');
    rr.rows.forEach(r => { rolesIds[r.code] = r.id; });

    const utilisateurs = [
      { prenom: 'Aminata',  nom: 'Ouédraogo', email: 'a.ouedraogo@mariestopes-bf.org', role: 'responsable_logistique', site: 'CSO',       mdp: 'Log@2026!' },
      { prenom: 'Ibrahim',  nom: 'Compaoré',  email: 'i.compaore@mariestopes-bf.org',  role: 'gestionnaire_achats',    site: 'CSO',       mdp: 'Ach@2026!' },
      { prenom: 'Mariam',   nom: 'Sawadogo',  email: 'm.sawadogo@mariestopes-bf.org',  role: 'magasinier',             site: 'MAG_CENT',  mdp: 'Mag@2026!' },
      { prenom: 'Souleymane', nom: 'Tall',    email: 's.tall@mariestopes-bf.org',      role: 'gestionnaire_equipements', site: 'CSO',     mdp: 'Equip@2026!' },
      { prenom: 'Fatimata', nom: 'Kaboré',    email: 'f.kabore@mariestopes-bf.org',    role: 'validateur',             site: 'CSO',       mdp: 'Val@2026!' },
      { prenom: 'Moussa',   nom: 'Diallo',    email: 'm.diallo@mariestopes-bf.org',    role: 'magasinier',             site: 'BOBO',      mdp: 'Mag2@2026!' },
    ];
    for (const u of utilisateurs) {
      const hash = await bcrypt.hash(u.mdp, 12);
      await client.query(
        `INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe_hash, role_id, site, premiere_connexion)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE)
         ON CONFLICT (email) DO NOTHING`,
        [u.nom, u.prenom, u.email, hash, rolesIds[u.role], u.site]
      );
    }
    console.log(`✅ ${utilisateurs.length} utilisateurs démo insérés`);

    // ── Stocks initiaux ────────────────────────────────────────
    const magIds = {};
    const mr = await client.query('SELECT id, code FROM magasins');
    mr.rows.forEach(m => { magIds[m.code] = m.id; });

    const artIds = {};
    const ar = await client.query('SELECT id, code FROM articles');
    ar.rows.forEach(a => { artIds[a.code] = a.id; });

    const stocksInit = [
      { art: 'ART-001', mag: 'MAG-CENT', qte: 500,  min: 100, max: 1000, cump: 1500 },
      { art: 'ART-002', mag: 'MAG-CENT', qte: 200,  min: 50,  max: 500,  cump: 8500 },
      { art: 'ART-003', mag: 'MAG-CENT', qte: 150,  min: 30,  max: 300,  cump: 4200 },
      { art: 'ART-004', mag: 'MAG-CENT', qte: 1000, min: 200, max: 3000, cump: 3500 },
      { art: 'ART-005', mag: 'MAG-CENT', qte: 300,  min: 100, max: 1000, cump: 450  },
      { art: 'ART-006', mag: 'MAG-CENT', qte: 80,   min: 20,  max: 200,  cump: 2800 },
      { art: 'ART-007', mag: 'MAG-CENT', qte: 50,   min: 10,  max: 100,  cump: 6500 },
      { art: 'ART-008', mag: 'MAG-CENT', qte: 40,   min: 10,  max: 100,  cump: 4800 },
      { art: 'ART-001', mag: 'MAG-CSO',  qte: 80,   min: 20,  max: 200,  cump: 1500 },
      { art: 'ART-002', mag: 'MAG-CSO',  qte: 30,   min: 10,  max: 100,  cump: 8500 },
      { art: 'ART-004', mag: 'MAG-CSO',  qte: 5,    min: 50,  max: 500,  cump: 3500 }, // rupture volontaire
      { art: 'ART-001', mag: 'MAG-BOBO', qte: 60,   min: 20,  max: 200,  cump: 1500 },
    ];
    for (const s of stocksInit) {
      if (!artIds[s.art] || !magIds[s.mag]) continue;
      await client.query(
        `INSERT INTO stocks (article_id, magasin_id, quantite, stock_min, stock_max, cump, valeur_totale)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (article_id, magasin_id, emplacement_id) DO NOTHING`,
        [artIds[s.art], magIds[s.mag], s.qte, s.min, s.max, s.cump, s.qte * s.cump]
      );
    }
    console.log(`✅ ${stocksInit.length} enregistrements de stock insérés`);

    // ── Lots avec dates de péremption ─────────────────────────
    const lots = [
      { art: 'ART-001', mag: 'MAG-CENT', lot: 'LOT-2026-001', qte: 300, perem: '2027-06-30', prix: 1500 },
      { art: 'ART-001', mag: 'MAG-CENT', lot: 'LOT-2026-002', qte: 200, perem: '2028-12-31', prix: 1500 },
      { art: 'ART-002', mag: 'MAG-CENT', lot: 'LOT-2026-003', qte: 200, perem: '2028-06-30', prix: 8500 },
      { art: 'ART-004', mag: 'MAG-CENT', lot: 'LOT-2026-004', qte: 1000, perem: '2027-03-31', prix: 3500 },
      { art: 'ART-005', mag: 'MAG-CENT', lot: 'LOT-EXPIRE-001', qte: 50, perem: '2025-12-31', prix: 450, expire: true },
    ];
    for (const l of lots) {
      if (!artIds[l.art] || !magIds[l.mag]) continue;
      await client.query(
        `INSERT INTO lots (article_id, magasin_id, numero_lot, quantite, date_peremption, prix_unitaire, source, statut)
         VALUES ($1,$2,$3,$4,$5,$6,'achat',$7)
         ON CONFLICT DO NOTHING`,
        [artIds[l.art], magIds[l.mag], l.lot, l.qte, l.perem, l.prix, l.expire ? 'expire' : 'disponible']
      );
    }
    console.log(`✅ ${lots.length} lots insérés (dont 1 expiré)`);

    await client.query('COMMIT');
    console.log('');
    console.log('🎉 Données de démonstration insérées avec succès !');
    console.log('');
    console.log('Comptes utilisateurs créés :');
    console.log('  admin@mariestopes-bf.org          → Admin@MSI2026!');
    console.log('  a.ouedraogo@mariestopes-bf.org    → Log@2026!  (Responsable logistique)');
    console.log('  i.compaore@mariestopes-bf.org     → Ach@2026!  (Gestionnaire achats)');
    console.log('  m.sawadogo@mariestopes-bf.org     → Mag@2026!  (Magasinier)');
    console.log('  s.tall@mariestopes-bf.org         → Equip@2026!(Équipements)');
    console.log('  f.kabore@mariestopes-bf.org       → Val@2026!  (Validateur)');
    console.log('  m.diallo@mariestopes-bf.org       → Mag2@2026! (Magasinier Bobo)');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Erreur seed :', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
