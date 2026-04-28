// Script Node.js pour créer un compte admin dans la base PostgreSQL locale
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'msi_gestion',
  user: process.env.DB_USER || 'msi_user',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function seedAdmin() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 1. Créer le rôle admin s'il n'existe pas
    const roleRes = await client.query(
      `INSERT INTO roles (code, libelle, permissions) VALUES ('admin', 'Administrateur', '{"*": {"*": true}}')
       ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle RETURNING id`
    );
    const roleId = roleRes.rows[0].id;

    // 2. Créer l'utilisateur admin s'il n'existe pas
    const email = 'admin@mariestopes-bf.org';
    const nom = 'Admin';
    const prenom = 'Principal';
    const password = 'Admin@MSI2026!';
    const hash = await bcrypt.hash(password, 12);
    const userRes = await client.query(
      `INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe_hash, role_id, actif, premiere_connexion)
       VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
       ON CONFLICT (email) DO UPDATE SET mot_de_passe_hash = EXCLUDED.mot_de_passe_hash RETURNING id` ,
      [nom, prenom, email, hash, roleId]
    );
    await client.query('COMMIT');
    console.log('✅ Compte admin créé ou mis à jour :', email, '\nMot de passe :', password);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erreur seed admin:', err);
  } finally {
    client.release();
    pool.end();
  }
}

seedAdmin();
