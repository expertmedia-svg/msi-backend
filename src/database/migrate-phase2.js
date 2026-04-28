/**
 * Migration Phase 2 - MSI Gestion
 * Crée : table justificatifs, colonne rapport_mission
 * Lance avec: npm run migrate:phase2
 */

require('dotenv').config();
const { initializeDatabase, query, saveDatabase } = require('../config/database');
const logger = require('../config/logger');

async function migratePhase2() {
  try {
    await initializeDatabase();
    logger.info('Démarrage migration Phase 2...');

    // Table justificatifs
    await query(`
      CREATE TABLE IF NOT EXISTS justificatifs (
        id TEXT PRIMARY KEY,
        type_document VARCHAR(50) NOT NULL,
        fichier_url VARCHAR(500) NOT NULL,
        fichier_nom VARCHAR(255),
        taille_octets INTEGER,
        mime_type VARCHAR(100),
        mission_id TEXT,
        vehicule_id TEXT,
        depense_id TEXT,
        type_depense VARCHAR(50),
        description TEXT,
        uploaded_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(mission_id) REFERENCES missions(id),
        FOREIGN KEY(vehicule_id) REFERENCES vehicules(id),
        FOREIGN KEY(uploaded_by) REFERENCES utilisateurs(id)
      )
    `);
    logger.info('✓ Table justificatifs créée');

    // Indices
    await query(`CREATE INDEX IF NOT EXISTS idx_justificatifs_mission ON justificatifs(mission_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_justificatifs_vehicule ON justificatifs(vehicule_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_justificatifs_type ON justificatifs(type_document)`);
    logger.info('✓ Indices créés');

    // Colonne rapport_mission à missions (si absent)
    try {
      await query(`ALTER TABLE missions ADD COLUMN rapport_mission TEXT`);
      logger.info('✓ Colonne rapport_mission ajoutée à missions');
    } catch (e) {
      if (e.message.includes('duplicate') || e.message.includes('already exists')) {
        logger.info('✓ Colonne rapport_mission déjà présente');
      } else {
        throw e;
      }
    }

    // Table incidents_vehicule - vérifier qu'elle existe
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS incidents_vehicule (
          id TEXT PRIMARY KEY,
          vehicule_id TEXT NOT NULL,
          type_incident VARCHAR(50),
          date_incident DATETIME NOT NULL,
          lieu VARCHAR(255),
          description TEXT NOT NULL,
          conducteur_id TEXT,
          blessures INTEGER DEFAULT 0,
          degats_materiels INTEGER DEFAULT 0,
          estimation_degats NUMERIC,
          rapport_police_numero VARCHAR(100),
          statut VARCHAR(50) DEFAULT 'ouvert',
          note_resolution TEXT,
          saisi_par TEXT,
          resolu_le DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(vehicule_id) REFERENCES vehicules(id),
          FOREIGN KEY(conducteur_id) REFERENCES utilisateurs(id),
          FOREIGN KEY(saisi_par) REFERENCES utilisateurs(id)
        )
      `);
      logger.info('✓ Table incidents_vehicule prête');
    } catch (e) {
      if (!e.message.includes('duplicate') && !e.message.includes('already exists')) {
        logger.warn('Incidents table warning:', e.message);
      }
    }

    saveDatabase();
    logger.info('✅ Migration Phase 2 complétée avec succès');
    process.exit(0);
  } catch (err) {
    logger.error('❌ Erreur migration:', err);
    process.exit(1);
  }
}

migratePhase2();
