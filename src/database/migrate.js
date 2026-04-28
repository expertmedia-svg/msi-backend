// src/database/migrate.js
// Applique le schéma SQL sur la base de données SQLite

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { initializeDatabase, query, saveDatabase, close, getDb } = require('../config/database');
const fs = require('fs');
const path = require('path');

async function migrate() {
  console.log('🔌 Initialisation de la base SQLite...');
  
  try {
    // Initialise la base
    await initializeDatabase();
    const db = getDb();
    console.log('✅ Base SQLite connectée');

    const schemaPath = path.join(__dirname, 'schema-sqlite.sql');
    if (!fs.existsSync(schemaPath)) {
      console.error(`Fichier schema-sqlite.sql introuvable : ${schemaPath}`);
      process.exit(1);
    }

    const sql = fs.readFileSync(schemaPath, 'utf8');
    console.log('📄 Application du schéma SQL...');

    // Exécute le schéma — supprime les lignes de commentaire avant de filtrer
    const statements = sql
      .split(';')
      .map(s =>
        s.split('\n')
          .filter(line => !line.trim().startsWith('--'))
          .join('\n')
          .trim()
      )
      .filter(s => s.length > 0);

    let executedCount = 0;
    let failedCount = 0;
    


    // Désactive les contraintes de clés étrangères
    db.run('PRAGMA foreign_keys = OFF');

    // Exécute tous les statements
    for (const statement of statements) {
      try {
        db.run(statement);
        executedCount++;
      } catch (err) {
        console.warn(`Avertissement lors de l'exécution: ${err.message.substring(0, 100)}`);
        failedCount++;
      }
    }

    // Réactive les contraintes de clés étrangères
    db.run('PRAGMA foreign_keys = ON');

    // Sauvegarde la base après création des tables
    saveDatabase();

    // Vérifie que la table roles existe
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='roles'");
    if (!tables || !tables[0] || !tables[0].values.length) {
      throw new Error("La table 'roles' n'a pas été créée !");
    }

    console.log('✅ Schéma appliqué avec succès');
    console.log('');
    console.log('Insertion des données initiales...');

    // Appelle la fonction d'insertion
    await insertInitialData();

    console.log('');
    console.log('✅ Migration terminée avec succès!');
    saveDatabase();
    close();
    process.exit(0);

  } catch (err) {
    console.error('❌ Erreur lors de la migration:', err.message);
    close();
    process.exit(1);
  }
}

async function insertInitialData() {
  const roleAdminId = uuidv4();
  const roleLogistiqueId = uuidv4();
  const roleAchatsId = uuidv4();
  const roleMagasinId = uuidv4();
  const roleEquipementsId = uuidv4();
  const roleValidateurId = uuidv4();
  const roleUtilisateurId = uuidv4();
  const roleInviteId = uuidv4();

  // Rôles
  const rolesData = [
    [roleAdminId, 'admin', 'Administrateur', '{"*": {"*": true}}'],
    [roleLogistiqueId, 'responsable_logistique', 'Responsable Logistique', 
      '{"achats": {"*": true}, "stocks": {"*": true}, "equipements": {"*": true}, "flotte": {"*": true}}'],
    [roleAchatsId, 'gestionnaire_achats', 'Gestionnaire Achats', '{"achats": {"*": true}}'],
    [roleMagasinId, 'magasinier', 'Magasinier', '{"stocks": {"lire": true, "creer": true, "modifier": true}}'],
    [roleEquipementsId, 'gestionnaire_equipements', 'Gestionnaire Équipements', 
      '{"equipements": {"*": true}, "flotte": {"*": true}}'],
    [roleValidateurId, 'validateur', 'Validateur', '{"achats": {"valider": true}, "stocks": {"valider": true}}'],
    [roleUtilisateurId, 'utilisateur', 'Utilisateur Standard', '{"*": {"lire": true}}'],
    [roleInviteId, 'invite', 'Invité', '{"*": {"lire": true}}']
  ];

  // Insère les rôles
  for (const role of rolesData) {
    await query(
      `INSERT OR IGNORE INTO roles (id, code, libelle, permissions, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      role
    );
  }

  // Devises
  const devisesData = [
    [uuidv4(), 'FCFA', 'Franc CFA', 1, 1],
    [uuidv4(), 'USD', 'Dollar américain', 600, 0],
    [uuidv4(), 'EUR', 'Euro', 655.957, 0],
    [uuidv4(), 'GBP', 'Livre sterling', 760, 0],
    [uuidv4(), 'CAD', 'Dollar canadien', 440, 0]
  ];

  for (const devise of devisesData) {
    await query(
      `INSERT OR IGNORE INTO devises (id, code, libelle, taux_vers_fcfa, est_devise_base, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      devise
    );
  }

  // Seuils d'achat
  const seuilsData = [
    [uuidv4(), 'Petit achat', 0, 500000, 'devis_unique', 1, 1],
    [uuidv4(), 'Achat intermédiaire', 500001, 2000000, 'comparaison_prix', 3, 1],
    [uuidv4(), 'Appel d\'offres local', 2000001, 10000000, 'ao_local', 5, 1],
    [uuidv4(), 'Appel d\'offres international', 10000001, null, 'ao_international', 5, 1]
  ];

  for (const seuil of seuilsData) {
    await query(
      `INSERT OR IGNORE INTO seuils_achat (id, libelle, montant_min, montant_max, procedure, nb_devis_requis, actif)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      seuil
    );
  }

  // Vérifie les données insérées
  try {
    const rolesResult = await query('SELECT COUNT(*) as count FROM roles');
    const roleCount = rolesResult.rows[0]?.count || 0;
    
    const devisesResult = await query('SELECT COUNT(*) as count FROM devises');
    const deviseCount = devisesResult.rows[0]?.count || 0;
    
    const seuilsResult = await query('SELECT COUNT(*) as count FROM seuils_achat');
    const seuilCount = seuilsResult.rows[0]?.count || 0;
    
    console.log('');
    console.log('Données initiales :');
    console.log(`  - Rôles : ${roleCount}`);
    console.log(`  - Devises : ${deviseCount}`);
    console.log(`  - Seuils d'achat : ${seuilCount}`);
  } catch (err) {
    console.warn('Avertissement lors de la vérification :', err.message);
  }
}

migrate();
