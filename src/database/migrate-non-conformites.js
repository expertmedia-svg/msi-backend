// Migration: Ajouter table non_conformites
const { query } = require('../config/database');
const logger = require('../config/logger');

const migrer = async () => {
  try {
    // Créer table non_conformites
    await query(`
      CREATE TABLE IF NOT EXISTS non_conformites (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        reception_id UUID REFERENCES receptions(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        quantite_affectee NUMERIC(10,3),
        photo_url VARCHAR(500),
        statut VARCHAR(50) DEFAULT 'ouverte',
        resolution_proposee TEXT,
        resolue_le TIMESTAMPTZ,
        resolve_par UUID REFERENCES utilisateurs(id),
        notes TEXT,
        created_by UUID REFERENCES utilisateurs(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_nc_reception ON non_conformites(reception_id);
      CREATE INDEX IF NOT EXISTS idx_nc_statut ON non_conformites(statut);
    `);

    logger.info('✅ Migration non_conformites complétée');
  } catch (error) {
    logger.error('❌ Erreur migration non_conformites:', error);
    throw error;
  }
};

module.exports = { migrer };
