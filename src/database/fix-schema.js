// Quick schema fix for missing columns
require('dotenv').config();
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../../data');
const dbName = process.env.DB_NAME || 'msi_gestion';
const dbPath = path.join(dataDir, dbName);

async function fixSchema() {
  console.log('🔧 Chargement de la base SQLite...');
  const SQL = await initSqlJs();

  let db;
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
    console.log(`✅ Base chargée : ${dbPath}`);
  } else {
    throw new Error('Database not found');
  }

  db.run('PRAGMA foreign_keys = OFF');

  // Add missing columns
  const fixes = [
    {
      table: 'fournisseurs',
      column: 'contact_principal',
      definition: "VARCHAR(100)",
      check: "PRAGMA table_info(fournisseurs) WHERE name='contact_principal'"
    },
    {
      table: 'fournisseurs',
      column: 'email_contact',
      definition: "VARCHAR(100)",
      check: "PRAGMA table_info(fournisseurs) WHERE name='email_contact'"
    }
  ];

  for (const fix of fixes) {
    try {
      const result = db.exec(fix.check);
      if (result.length === 0) {
        console.log(`  ⚙️  Ajout colonne ${fix.column} à ${fix.table}...`);
        db.run(`ALTER TABLE ${fix.table} ADD COLUMN ${fix.column} ${fix.definition}`);
        console.log(`  ✅ Colonne ${fix.column} ajoutée`);
      }
    } catch (err) {
      console.log(`  ⏭️  Colonne ${fix.column} existe déjà`);
    }
  }

  db.run('PRAGMA foreign_keys = ON');

  // Save
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  console.log(`\n✅ Schéma corrigé et sauvegardé`);
}

fixSchema().catch(err => {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
});
