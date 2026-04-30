
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { initializeDatabase, query, saveDatabase, close, getDb } = require('../config/database');

const PROD_USERS = [
  {
    nom: 'Direction',
    prenom: 'MSI',
    email: 'directeur@mariestopes-bf.org',
    password: 'Dir@MSI2026!',
    role_code: 'directeur'
  },
  {
    nom: 'Logistique',
    prenom: 'Superviseur',
    email: 'superviseur@mariestopes-bf.org',
    password: 'Sup@MSI2026!',
    role_code: 'superviseur_logistique'
  },
  {
    nom: 'Terrain',
    prenom: 'Agent',
    email: 'agent@mariestopes-bf.org',
    password: 'Agent@MSI2026!',
    role_code: 'agent_terrain'
  },
  {
    nom: 'Transport',
    prenom: 'Chauffeur',
    email: 'chauffeur@mariestopes-bf.org',
    password: 'Chauffeur@2026!',
    role_code: 'chauffeur'
  },
  {
    nom: 'Audit',
    prenom: 'Bailleur',
    email: 'auditeur@mariestopes-bf.org',
    password: 'Audit@MSI2026!',
    role_code: 'auditeur_bailleur'
  }
];

async function seedProdUsers() {
  try {
    console.log('🌱 Initialisation de la base pour le seed production...');
    await initializeDatabase();
    const db = getDb();

    for (const user of PROD_USERS) {
      // 1. Trouver le role_id
      const roleRes = await query('SELECT id FROM roles WHERE code = ?', [user.role_code]);
      if (roleRes.rows.length === 0) {
        console.warn(`⚠️ Rôle non trouvé : ${user.role_code}. Création du rôle...`);
        const roleId = uuidv4();
        await query(
          'INSERT INTO roles (id, code, libelle, permissions) VALUES (?, ?, ?, ?)',
          [roleId, user.role_code, user.role_code, '{"*": {"lire": true}}']
        );
        user.role_id = roleId;
      } else {
        user.role_id = roleRes.rows[0].id;
      }

      // 2. Hasher le mot de passe
      const hash = await bcrypt.hash(user.password, 12);

      // 3. Insérer l'utilisateur
      await query(
        `INSERT INTO utilisateurs (id, nom, prenom, email, mot_de_passe_hash, role_id, actif, premiere_connexion, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, datetime('now'), datetime('now'))
         ON CONFLICT(email) DO UPDATE SET mot_de_passe_hash = EXCLUDED.mot_de_passe_hash`,
        [uuidv4(), user.nom, user.prenom, user.email, hash, user.role_id]
      );
      console.log(`✅ Utilisateur créé/mis à jour : ${user.email}`);
    }

    saveDatabase();
    console.log('✨ Seed production terminé avec succès !');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur lors du seed :', err);
    process.exit(1);
  }
}

seedProdUsers();
