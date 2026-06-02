/**
 * Fix missing columns in SQLite schema
 * Lance avec: node src/database/fix-schema.js
 */

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

  // Add missing columns to fournisseurs
  const columnsToAdd = [
    { column: 'contact_principal', type: 'VARCHAR(100)' },
    { column: 'email_contact', type: 'VARCHAR(100)' }
  ];

  console.log('\n🔧 Ajout des colonnes manquantes...');
  for (const col of columnsToAdd) {
    try {
      db.run(`ALTER TABLE fournisseurs ADD COLUMN ${col.column} ${col.type}`);
      console.log(`  ✅ Colonne ${col.column} ajoutée à fournisseurs`);
    } catch (err) {
      if (err.message.includes('duplicate column')) {
        console.log(`  ⏭️  Colonne ${col.column} existe déjà`);
      } else {
        console.log(`  ⚠️  ${err.message}`);
      }
    }
  }

  db.run('PRAGMA foreign_keys = ON');

  // Save
  console.log('\n💾 Sauvegarde...');
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  console.log(`✅ Schéma corrigé et sauvegardé`);
  console.log(`   Fichier: ${dbPath}`);
}

fixSchema().catch(err => {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
});
