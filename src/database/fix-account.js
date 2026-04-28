require('dotenv').config();
const { initializeDatabase, getDb, saveDatabase, close } = require('../config/database');

async function fixAccount() {
  await initializeDatabase();
  const db = getDb();

  // Réactive tous les comptes désactivés (ou juste adminmsi)
  const before = db.exec("SELECT id, email, actif FROM utilisateurs");
  console.log('Comptes actuels:');
  if (before[0]) {
    before[0].values.forEach(r => console.log(`  ${r[1]} - actif=${r[2]}`));
  }

  db.run("UPDATE utilisateurs SET actif = 1 WHERE email = 'adminmsi@mariestopes-bf.org'");

  const after = db.exec("SELECT id, email, actif FROM utilisateurs WHERE email = 'adminmsi@mariestopes-bf.org'");
  console.log('\nAprès correction:');
  if (after[0]) {
    after[0].values.forEach(r => console.log(`  ${r[1]} - actif=${r[2]}`));
  }

  saveDatabase();
  close();
  console.log('\n✅ Compte réactivé.');
  process.exit(0);
}

fixAccount().catch(err => { console.error(err); process.exit(1); });
