// seed-roles-final.js
// Crée les 6 rôles d'application avec les permissions appropriées

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { initializeDatabase, getDb, saveDatabase } = require('../config/database');

const ROLES = [
  {
    code: 'admin_systeme',
    libelle: 'Administrateur système',
    permissions: {
      users: { create: true, read: true, update: true, delete: true },
      roles: { create: true, read: true, update: true, delete: true },
      settings: { create: true, read: true, update: true, delete: true },
      audit: { read: true },
      backups: { create: true, read: true },
      logs: { read: true }
    }
  },
  {
    code: 'directeur',
    libelle: 'Directeur / Manager',
    permissions: {
      dashboard: { read: true },
      achats: { read: true, validate: true },
      stocks: { read: true },
      equipements: { read: true },
      flotte: { read: true },
      rapports: { create: true, read: true, export: true },
      audit: { read: true }
    }
  },
  {
    code: 'superviseur_logistique',
    libelle: 'Superviseur logistique',
    permissions: {
      achats: { read: true, update: true, validate: true },
      stocks: { create: true, read: true, update: true, validate: true },
      equipements: { create: true, read: true, update: true, assign: true },
      flotte: { create: true, read: true, update: true, assign: true },
      justificatifs: { read: true, validate: true }
    }
  },
  {
    code: 'agent_terrain',
    libelle: 'Agent terrain',
    permissions: {
      stocks: { create: true, read: true, scan: true },
      sorties_stock: { create: true, read: true, photo: true },
      approvisionnement: { create: true, read: true, request: true },
      offline: { sync: true },
      justificatifs: { create: true, read: true, photo: true }
    }
  },
  {
    code: 'chauffeur',
    libelle: 'Chauffeur',
    permissions: {
      flotte: { read: true },
      mouvements_flotte: { create: true, read: true, photo: true },
      carburant: { create: true, read: true, photo: true },
      incidents: { create: true, read: true, photo: true }
    }
  },
  {
    code: 'auditeur_bailleur',
    libelle: 'Auditeur bailleur',
    permissions: {
      achats: { read: true },
      stocks: { read: true },
      equipements: { read: true },
      flotte: { read: true },
      rapports: { read: true, export: true },
      justificatifs: { read: true, photo: true },
      audit: { read: true }
    }
  }
];

async function seedRoles() {
  try {
    await initializeDatabase();
    const db = getDb();

    console.log('🔄 Mise à jour des rôles...\n');

    // Supprime les anciens rôles (optionnel - commenté pour sécurité)
    // db.run('DELETE FROM roles');

    // Insère les 6 rôles
    for (const role of ROLES) {
      const id = uuidv4();
      const permissions = JSON.stringify(role.permissions);
      
      try {
        db.run(
          `INSERT OR REPLACE INTO roles (id, code, libelle, permissions, created_at, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [id, role.code, role.libelle, permissions]
        );
        console.log(`✅ ${role.libelle} (${role.code})`);
      } catch (err) {
        console.error(`❌ Erreur pour ${role.libelle}:`, err.message);
      }
    }

    saveDatabase();
    console.log('\n✅ Rôles configurés avec succès!');

    // Affiche les rôles créés
    console.log('\n📋 Rôles actuels :');
    const rows = db.exec('SELECT code, libelle FROM roles ORDER BY libelle');
    if (rows.length && rows[0].values.length) {
      rows[0].values.forEach(([code, libelle]) => {
        console.log(`   - ${libelle} (${code})`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  }
}

seedRoles();
