// src/database/seed-simple.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { initializeDatabase, query, saveDatabase, close, getDb } = require('../config/database');

async function seedSimple() {
  console.log('🌱 Création des identifiants simplifiés...');
  
  try {
    await initializeDatabase();
    const db = getDb();
    
    const hashAdmin = await bcrypt.hash('admin', 12);
    const hashTerrain = await bcrypt.hash('terrain', 12);
    const hashDirection = await bcrypt.hash('direction', 12);
    
    // Récupérer les rôles
    const roles = {};
    const rolesRows = await query('SELECT id, code FROM roles');
    rolesRows.rows.forEach(r => roles[r.code] = r.id);
    
    if (!roles['admin']) {
        console.error('❌ Rôles non trouvés. Veuillez lancer : npm run migrate');
        process.exit(1);
    }

    const users = [
      { id: uuidv4(), nom: 'Admin', prenom: 'MSI', email: 'admin@msi.bf', hash: hashAdmin, role: roles['admin'] },
      { id: uuidv4(), nom: 'Terrain', prenom: 'MSI', email: 'terrain@msi.bf', hash: hashTerrain, role: roles['magasinier'] || roles['utilisateur'] },
      { id: uuidv4(), nom: 'Direction', prenom: 'MSI', email: 'direction@msi.bf', hash: hashDirection, role: roles['responsable_logistique'] || roles['admin'] }
    ];

    for (const u of users) {
      await query(
        `INSERT OR REPLACE INTO utilisateurs (id, nom, prenom, email, mot_de_passe_hash, role_id, actif, premiere_connexion, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, datetime('now'), datetime('now'))`,
        [u.id, u.nom, u.prenom, u.email, u.hash, u.role]
      );
      console.log(`✅ Créé : ${u.email} / ${u.email.split('@')[0]}`);
    }

    saveDatabase();
    console.log('✅ Seed terminé.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur :', err.message);
    process.exit(1);
  }
}

seedSimple();
