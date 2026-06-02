/**
 * Create test users for MSI Gestion
 * Run with: node src/database/create-test-users.js
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { initializeDatabase, query, saveDatabase, close } = require('../config/database');

const testUsers = [
  {
    nom: 'Admin',
    prenom: 'MSI',
    email: 'adminmsi@mariestopes-bf.org',
    password: 'Admin@2026',
    role: 'admin',
    departement: 'Direction'
  },
  {
    nom: 'Directeur',
    prenom: 'Test',
    email: 'directeur@mariestopes-bf.org',
    password: 'Dir@2026',
    role: 'responsable_logistique',
    departement: 'Direction'
  },
  {
    nom: 'Superviseur',
    prenom: 'Logistique',
    email: 'superviseur@mariestopes-bf.org',
    password: 'Sup@2026',
    role: 'responsable_logistique',
    departement: 'Logistique'
  },
  {
    nom: 'Agent',
    prenom: 'Terrain',
    email: 'agent@mariestopes-bf.org',
    password: 'Agt@2026',
    role: 'utilisateur',
    departement: 'Terrain'
  },
  {
    nom: 'Chauffeur',
    prenom: 'Test',
    email: 'chauffeur@mariestopes-bf.org',
    password: 'Ch@2026',
    role: 'utilisateur',
    departement: 'Flotte'
  },
  {
    nom: 'Auditeur',
    prenom: 'Bailleur',
    email: 'auditeur@mariestopes-bf.org',
    password: 'Aud@2026',
    role: 'validateur',
    departement: 'Audit'
  }
];

async function createTestUsers() {
  try {
    await initializeDatabase();
    console.log('✅ Base SQLite initialisée');

    // Get role IDs
    const adminRole = await query("SELECT id FROM roles WHERE code = 'admin'");
    const logRole = await query("SELECT id FROM roles WHERE code = 'responsable_logistique'");
    const userRole = await query("SELECT id FROM roles WHERE code = 'utilisateur'");
    const valRole = await query("SELECT id FROM roles WHERE code = 'validateur'");

    const roleMap = {
      'admin': adminRole.rows[0]?.id,
      'responsable_logistique': logRole.rows[0]?.id,
      'utilisateur': userRole.rows[0]?.id,
      'validateur': valRole.rows[0]?.id
    };

    console.log('🔐 Création des utilisateurs de test...');
    let created = 0;

    for (const user of testUsers) {
      const roleId = roleMap[user.role];
      if (!roleId) {
        console.warn(`⚠️  Rôle '${user.role}' non trouvé, ignoré`);
        continue;
      }

      const hash = await bcrypt.hash(user.password, 12);
      const userId = uuidv4();

      try {
        await query(
          `INSERT INTO utilisateurs
           (id, nom, prenom, email, mot_de_passe_hash, role_id, departement, actif, premiere_connexion)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`,
          [userId, user.nom, user.prenom, user.email, hash, roleId, user.departement]
        );
        console.log(`  ✅ ${user.email} (${user.role})`);
        created++;
      } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          console.log(`  ⏭️  ${user.email} existe déjà`);
        } else {
          console.error(`  ❌ Erreur ${user.email}:`, err.message);
        }
      }
    }

    saveDatabase();
    console.log(`\n✅ ${created} utilisateurs créés avec succès`);
    console.log('\n🔑 Identifiants de test:');
    testUsers.forEach(u => {
      console.log(`  ${u.email} / ${u.password}`);
    });

    close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    close();
    process.exit(1);
  }
}

createTestUsers();
