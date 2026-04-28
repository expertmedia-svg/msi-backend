// seed-demo-admin.js
// Crée/met à jour le compte admin de démo : adminmsi@mariestopes-bf.org / mariestop

require('dotenv').config();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { initializeDatabase, getDb, saveDatabase } = require('../config/database');

const DEMO_EMAIL = 'adminmsi@mariestopes-bf.org';
const DEMO_PASSWORD = 'mariestop';

async function seedDemoAdmin() {
  await initializeDatabase();
  const db = getDb();

  // Vérifie que le rôle admin existe
  const roleRows = db.exec("SELECT id FROM roles WHERE code = 'admin' LIMIT 1");
  if (!roleRows.length || !roleRows[0].values.length) {
    console.error('❌ Rôle admin introuvable. Lancez d\'abord : npm run migrate');
    process.exit(1);
  }
  const roleId = roleRows[0].values[0][0];

  // Hash du mot de passe
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // Upsert : crée ou met à jour l'utilisateur adminmsi
  const existing = db.exec(`SELECT id FROM utilisateurs WHERE email = '${DEMO_EMAIL}' LIMIT 1`);

  if (existing.length && existing[0].values.length) {
    db.run(
      `UPDATE utilisateurs SET mot_de_passe_hash = ?, role_id = ?, actif = 1, premiere_connexion = 0,
       tentatives_echec = 0, verrouille_jusqu_a = NULL WHERE email = '${DEMO_EMAIL}'`,
      [hash, roleId]
    );
    console.log('✅ Compte admin démo mis à jour');
  } else {
    db.run(
      `INSERT INTO utilisateurs (id, nom, prenom, email, mot_de_passe_hash, role_id, actif, premiere_connexion, created_at, updated_at)
       VALUES (?, 'Admin', 'MSI', '${DEMO_EMAIL}', ?, ?, 1, 0, datetime('now'), datetime('now'))`,
      [uuidv4(), hash, roleId]
    );
    console.log('✅ Compte admin démo créé');
  }

  saveDatabase();

  console.log('');
  console.log('🔐 Identifiants démo admin :');
  console.log(`   Email    : ${DEMO_EMAIL}`);
  console.log(`   Password : ${DEMO_PASSWORD}`);
  console.log('   Rôle     : Administrateur');
  console.log('');

  process.exit(0);
}

seedDemoAdmin().catch(err => {
  console.error('❌ Erreur :', err.message);
  process.exit(1);
});
