// seed-demo-users-all-roles.js
// Crée des utilisateurs de démo pour chaque rôle

require('dotenv').config();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { initializeDatabase, getDb, saveDatabase } = require('../config/database');

const DEMO_USERS = [
  {
    nom: 'Admin',
    prenom: 'Système',
    email: 'admin@mariestopes-bf.org',
    password: 'Admin@MSI2026!',
    role_code: 'admin_systeme',
    site: 'Siège',
    departement: 'IT'
  },
  {
    nom: 'Directeur',
    prenom: 'Principal',
    email: 'directeur@mariestopes-bf.org',
    password: 'Dir@MSI2026!',
    role_code: 'directeur',
    site: 'Siège',
    departement: 'Direction'
  },
  {
    nom: 'Superviseur',
    prenom: 'Logistique',
    email: 'superviseur@mariestopes-bf.org',
    password: 'Sup@MSI2026!',
    role_code: 'superviseur_logistique',
    site: 'Magasin Central',
    departement: 'Logistique'
  },
  {
    nom: 'Agent',
    prenom: 'Terrain',
    email: 'agent@mariestopes-bf.org',
    password: 'Agent@MSI2026!',
    role_code: 'agent_terrain',
    site: 'Terrain',
    departement: 'Opérations'
  },
  {
    nom: 'Chauffeur',
    prenom: 'Principal',
    email: 'chauffeur@mariestopes-bf.org',
    password: 'Chauffeur@2026!',
    role_code: 'chauffeur',
    site: 'Garage',
    departement: 'Flotte'
  },
  {
    nom: 'Auditeur',
    prenom: 'Bailleur',
    email: 'auditeur@mariestopes-bf.org',
    password: 'Audit@MSI2026!',
    role_code: 'auditeur_bailleur',
    site: 'Siège',
    departement: 'Audit'
  }
];

async function seedDemoUsers() {
  try {
    await initializeDatabase();
    const db = getDb();

    console.log('👥 Création des utilisateurs de démo...\n');

    for (const user of DEMO_USERS) {
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
           (id, nom, prenom, email, mot_de_passe_hash, role_id, site, departement, 
            actif, premiere_connexion, tentatives_echec, verrouille_jusqu_a, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, NULL, datetime('now'), datetime('now'))`,
          [userId, user.nom, user.prenom, user.email, hash, roleId, user.site, user.departement]
        );
        console.log(`✅ ${user.nom} ${user.prenom} (${user.role_code})`);
      } catch (err) {
        console.error(`❌ Erreur pour ${user.email}:`, err.message);
      }
    }

    saveDatabase();
    console.log('\n✅ Utilisateurs de démo créés avec succès!\n');

    // Affiche les identifiants
    console.log('🔐 Identifiants de démo :');
    console.log('═'.repeat(60));
    
    for (const user of DEMO_USERS) {
      console.log(`\n📌 ${user.nom} ${user.prenom}`);
      console.log(`   Rôle        : ${user.role_code}`);
      console.log(`   Email       : ${user.email}`);
      console.log(`   Mot de passe: ${user.password}`);
    }

    console.log('\n' + '═'.repeat(60));
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  }
}

seedDemoUsers();
