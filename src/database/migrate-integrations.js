/**
 * Migration – Intégrations SUN / CLIC+ / ORION / MATE
 * Lance avec: node src/database/migrate-integrations.js
 *
 * Utilise l'API synchrone sql.js pour éviter les problèmes
 * de timing avec la base en mémoire.
 */

require('dotenv').config();
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dataDir = path.join(__dirname, '../../data');
const dbName = process.env.DB_NAME || 'msi_gestion';
const dbPath = path.join(dataDir, dbName);

async function migrate() {
  console.log('🔄 Chargement de la base SQLite...');
  const SQL = await initSqlJs();

  let db;
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
    console.log(`✅ Base chargée : ${dbPath}`);
  } else {
    db = new SQL.Database();
    console.log(`✅ Nouvelle base créée : ${dbPath}`);
  }

  db.run('PRAGMA foreign_keys = OFF');

  // ── Table integrations_config ────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS integrations_config (
      id TEXT PRIMARY KEY,
      system_code VARCHAR(20) NOT NULL UNIQUE,
      system_nom VARCHAR(100) NOT NULL,
      description TEXT,
      api_url VARCHAR(500),
      api_key TEXT,
      webhook_url VARCHAR(500),
      statut VARCHAR(20) DEFAULT 'non_configure',
      actif INTEGER DEFAULT 0,
      dernier_sync DATETIME,
      dernier_statut VARCHAR(20),
      dernier_message TEXT,
      nb_syncs_ok INTEGER DEFAULT 0,
      nb_syncs_erreur INTEGER DEFAULT 0,
      format_export VARCHAR(20) DEFAULT 'json',
      config_extra TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ Table integrations_config prête');

  // ── Table integrations_logs ──────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS integrations_logs (
      id TEXT PRIMARY KEY,
      system_code VARCHAR(20) NOT NULL,
      direction VARCHAR(10) DEFAULT 'export',
      statut VARCHAR(20) NOT NULL,
      nb_enregistrements INTEGER DEFAULT 0,
      message TEXT,
      payload_resume TEXT,
      duree_ms INTEGER,
      declencheur VARCHAR(50) DEFAULT 'manuel',
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ Table integrations_logs prête');

  // ── Seed des 4 systèmes MSI ──────────────────────────────────
  const systemes = [
    {
      id: uuidv4(),
      code: 'SUN',
      nom: 'SUN Systems (Finance)',
      desc: 'Système financier MSI International – export des valorisations stock, engagements achats et immobilisations équipements.',
      fmt: 'excel',
    },
    {
      id: uuidv4(),
      code: 'CLIC_PLUS',
      nom: 'CLIC+ (Logistique)',
      desc: 'Plateforme logistique MSI – triangulation des mouvements de stock pharmaceutique et suivi des lots/péremptions.',
      fmt: 'json',
    },
    {
      id: uuidv4(),
      code: 'ORION',
      nom: 'ORION (RH & Actifs)',
      desc: 'Système RH et gestion des actifs MSI – synchronisation des affectations équipements par agent et site.',
      fmt: 'json',
    },
    {
      id: uuidv4(),
      code: 'MATE',
      nom: 'MATE (Flotte & Terrain)',
      desc: 'Système de suivi terrain MSI – export des missions, consommation carburant et incidents flotte.',
      fmt: 'json',
    },
  ];

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO integrations_config
      (id, system_code, system_nom, description, statut, actif, format_export, updated_at)
    VALUES (?, ?, ?, ?, 'non_configure', 0, ?, datetime('now'))
  `);

  for (const s of systemes) {
    insertStmt.run([s.id, s.code, s.nom, s.desc, s.fmt]);
    console.log(`  ✓ ${s.code} – ${s.nom}`);
  }
  insertStmt.free();

  // ── Sauvegarde ───────────────────────────────────────────────
  const data = db.export();
  const buffer = Buffer.from(data);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbPath, buffer);
  db.close();

  console.log('');
  console.log('✅ Migration Intégrations complétée avec succès');
  console.log('   4 systèmes seedés : SUN, CLIC+, ORION, MATE');
  process.exit(0);
}

migrate().catch(err => {
  console.error('❌ Erreur migration:', err.message);
  process.exit(1);
});
