// seed-simple-demo-users.js
// Crée des utilisateurs de démo simplifiés avec identifiants courts

require('dotenv').config();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { initializeDatabase, getDb, saveDatabase } = require('../config/database');

const SIMPLE_DEMO_USERS = [
  {
    username: 'admin',
    nom: 'Admin',
    prenom: 'MSI',
    email: 'admin@msi.bf',
    password: 'admin',
    role_code: 'admin_systeme'
  },
  {
    username: 'directeur',
    nom: 'Direction',
    prenom: 'MSI',
    email: 'directeur@msi.bf',
    password: 'directeur',
    role_code: 'directeur'
  },
  {
    username: 'superviseur',
    nom: 'Superviseur',
    prenom: 'Logistique',
    email: 'superviseur@msi.bf',
    password: 'superviseur',
    role_code: 'superviseur_logistique'
  },
  {
    username: 'agent',
    nom: 'Agent',
    prenom: 'Terrain',
    email: 'agent@msi.bf',
    password: 'agent',
    role_code: 'agent_terrain'
  },
  {
    username: 'chauffeur',
    nom: 'Chauffeur',
    prenom: 'MSI',
    email: 'chauffeur@msi.bf',
    password: 'chauffeur',
    role_code: 'chauffeur'
  },
  {
    username: 'auditeur',
    nom: 'Auditeur',
    prenom: 'Bailleur',
    email: 'auditeur@msi.bf',
    password: 'auditeur',
    role_code: 'auditeur_bailleur'
  }
];

async function seedSimpleDemoUsers() {
  try {
    await initializeDatabase();
    const db = getDb();

    console.log('👥 Création des utilisateurs de démo simplifiés...\n');

    for (const user of SIMPLE_DEMO_USERS) {
      // Récupère le rôle
      const roleRows = db.exec(`SELECT id FROM roles WHERE code = '${user.role_code}' LIMIT 1`);
      if (!roleRows.length || !roleRows[0].values.length) {
        console.error(`❌ Rôle ${user.role_code} introuvable`);
        continue;
      }
      const roleId = roleRows[0].values[0][0];

      // Crée le hash du mot de passe
      const hash = await bcrypt.hash(user.password, 12);

      // Upsert utilisateur
      const userId = uuidv4();
      try {
        db.run(
          `INSERT OR REPLACE INTO utilisateurs 
           (id, nom, prenom, email, mot_de_passe_hash, role_id, 
            actif, premiere_connexion, tentatives_echec, verrouille_jusqu_a, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, NULL, datetime('now'), datetime('now'))`,
          [userId, user.nom, user.prenom, user.email, hash, roleId]
        );
        console.log(`✅ ${user.username} → ${user.email} / ${user.password}`);
      } catch (err) {
        console.error(`❌ Erreur pour ${user.email}:`, err.message);
      }
    }

    saveDatabase();
    console.log('\n✅ Utilisateurs simplifiés créés avec succès!\n');

    console.log('🔐 Identifiants rapides :');
    console.log('═'.repeat(60));
    
    for (const user of SIMPLE_DEMO_USERS) {
      console.log(`${user.username.padEnd(15)} / ${user.password.padEnd(15)} → ${user.role_code}`);
    }

    console.log('═'.repeat(60));
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  }
}

seedSimpleDemoUsers();
