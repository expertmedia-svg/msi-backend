// src/config/database.js
// Configuration et connexion SQLite avec sql.js

const initSqlJs = require('sql.js');
const path = require('path');
const logger = require('./logger');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Crée le dossier data si nécessaire
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, process.env.DB_NAME || 'msi_gestion.db');

let db = null;
let SQL = null;

// Initialise sql.js (synchrone après le chargement)
async function initializeDatabase() {
  try {
    SQL = await initSqlJs();
    
    // Charge la base depuis le fichier ou crée une nouvelle
    if (fs.existsSync(dbPath)) {
      const filebuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(filebuffer);
      logger.info(`✅ Base SQLite chargée: ${dbPath}`);
    } else {
      db = new SQL.Database();
      logger.info(`✅ Nouvelle base SQLite créée: ${dbPath}`);
    }
    
    // Active les clés étrangères
    db.run('PRAGMA foreign_keys = ON');
    
    return db;
  } catch (err) {
    logger.error('Impossible de initialiser SQLite:', err.message);
    process.exit(1);
  }
}

/**
 * Sauvegarde la base de données sur disque
 */
function saveDatabase() {
  if (db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (err) {
      logger.error('Erreur lors de la sauvegarde:', err.message);
    }
  }
}

/**
 * Convertit la syntaxe PostgreSQL en SQLite.
 * Retourne { sql, params } avec les params réordonnés si $N sont répétés.
 */
function pgToSqlite(sql, params = []) {
  // 1. Gérer les $N répétés : reconstruire params dans l'ordre d'apparition
  const newParams = [];
  sql = sql.replace(/\$(\d+)/g, (_m, n) => {
    newParams.push(params[parseInt(n, 10) - 1]);
    return '?';
  });
  // Si aucun $N trouvé, conserver les params d'origine (requêtes déjà en syntaxe ?)
  if (newParams.length === 0) newParams.push(...params);

  // 2. Transformations syntaxiques — ORDRE IMPORTANT
  sql = sql
    // INTERVAL composés (avant NOW/CURRENT_DATE)
    .replace(/CURRENT_DATE\s*\+\s*INTERVAL\s+'(\d+)\s+(\w+)'/gi, "date('now', '+$1 $2')")
    .replace(/CURRENT_DATE\s*-\s*INTERVAL\s+'(\d+)\s+(\w+)'/gi, "date('now', '-$1 $2')")
    .replace(/NOW\(\)\s*\+\s*INTERVAL\s+'(\d+)\s+(\w+)'/gi, "datetime('now', '+$1 $2')")
    .replace(/NOW\(\)\s*-\s*INTERVAL\s+'(\d+)\s+(\w+)'/gi, "datetime('now', '-$1 $2')")
    // date_trunc AVANT NOW/CURRENT_DATE (ses args contiennent NOW/CURRENT_DATE)
    .replace(/date_trunc\s*\(\s*'month'\s*,\s*NOW\s*\(\s*\)\s*\)/gi,        "strftime('%Y-%m-01', datetime('now'))")
    .replace(/date_trunc\s*\(\s*'month'\s*,\s*CURRENT_DATE\s*\)/gi,          "strftime('%Y-%m-01', date('now'))")
    .replace(/date_trunc\s*\(\s*'year'\s*,\s*NOW\s*\(\s*\)\s*\)/gi,         "strftime('%Y-01-01', datetime('now'))")
    .replace(/date_trunc\s*\(\s*'year'\s*,\s*CURRENT_DATE\s*\)/gi,           "strftime('%Y-01-01', date('now'))")
    .replace(/date_trunc\s*\(\s*'month'\s*,\s*([^()]+?)\s*\)/gi, "strftime('%Y-%m-01', $1)")
    .replace(/date_trunc\s*\(\s*'year'\s*,\s*([^()]+?)\s*\)/gi,  "strftime('%Y-01-01', $1)")
    .replace(/date_trunc\s*\(\s*'day'\s*,\s*([^()]+?)\s*\)/gi,   "date($1)")
    // EXTRACT AVANT NOW/CURRENT_DATE
    .replace(/EXTRACT\s*\(\s*YEAR\s+FROM\s+AGE\s*\(\s*([^,)]+?)\s*,\s*([^)]+?)\s*\)\s*\)/gi,
      "CAST((julianday($1) - julianday($2)) / 365.25 AS INTEGER)")
    .replace(/EXTRACT\s*\(\s*YEAR\s+FROM\s+NOW\s*\(\s*\)\s*\)/gi,    "CAST(strftime('%Y', datetime('now')) AS INTEGER)")
    .replace(/EXTRACT\s*\(\s*YEAR\s+FROM\s+CURRENT_DATE\s*\)/gi,     "CAST(strftime('%Y', date('now')) AS INTEGER)")
    .replace(/EXTRACT\s*\(\s*MONTH\s+FROM\s+NOW\s*\(\s*\)\s*\)/gi,   "CAST(strftime('%m', datetime('now')) AS INTEGER)")
    .replace(/EXTRACT\s*\(\s*MONTH\s+FROM\s+CURRENT_DATE\s*\)/gi,    "CAST(strftime('%m', date('now')) AS INTEGER)")
    .replace(/EXTRACT\s*\(\s*YEAR\s+FROM\s+([^()]+?)\s*\)/gi,        "CAST(strftime('%Y', $1) AS INTEGER)")
    .replace(/EXTRACT\s*\(\s*MONTH\s+FROM\s+([^()]+?)\s*\)/gi,       "CAST(strftime('%m', $1) AS INTEGER)")
    .replace(/EXTRACT\s*\(\s*DAY\s+FROM\s+([^()]+?)\s*\)/gi,         "CAST(strftime('%d', $1) AS INTEGER)")
    // NOW / CURRENT_DATE seuls (après tous les cas composés)
    .replace(/\bNOW\(\)/gi, "datetime('now')")
    .replace(/\bCURRENT_DATE\b/g, "date('now')")
    // Autres
    .replace(/\bILIKE\b/gi, 'LIKE')
    .replace(/\bTRUE\b/g, '1')
    .replace(/\bFALSE\b/g, '0')
    .replace(/::(text|integer|int|boolean|numeric|real|float|date|timestamp)\b/gi, '')
    .replace(/GREATEST\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi,
      'CASE WHEN ($1) > ($2) THEN ($1) ELSE ($2) END');

  return { sql, params: newParams };
}

/**
 * Wrapper pour exécuter une requête SQL - retourne au format pg pour compatibilité
 */
const query = async (text, params = []) => {
  const converted = pgToSqlite(text, params);
  text = converted.sql;
  params = converted.params;
  const start = Date.now();
  
  if (!db) {
    throw new Error('Database not initialized');
  }
  
  try {
    // Détermine le type de requête
    const isSelect = text.trim().toUpperCase().startsWith('SELECT');
    const isInsertUpdateDelete = /^(INSERT|UPDATE|DELETE)/i.test(text.trim());
    
    if (isSelect) {
      // SELECT - retourne tous les résultats
      const stmt = db.prepare(text);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        const raw = stmt.getAsObject();
        // Normalise les noms de colonnes : COUNT(*) → count, COUNT(*)+1 → count, etc.
        const normalized = {};
        for (const [k, v] of Object.entries(raw)) {
          const key = k.replace(/^count\(\*\).*/i, 'count').replace(/^COUNT\(\*\).*/i, 'count');
          normalized[key] = v;
        }
        rows.push(normalized);
      }
      stmt.free();
      
      const duration = Date.now() - start;
      if (duration > 1000) {
        logger.warn(`Requête lente (${duration}ms): ${text.substring(0, 100)}`);
      }
      
      // Retourne au format pg
      return {
        rows: rows,
        rowCount: rows.length,
        result: rows
      };
    } else if (isInsertUpdateDelete) {
      // Auto-inject UUID for INSERT statements missing an explicit id
      const isInsert = /^INSERT/i.test(text.trim());
      if (isInsert) {
        const colMatch = text.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+\w+\s*\(([^)]+)\)/i);
        if (colMatch && !/\bid\b/i.test(colMatch[1])) {
          const autoId = uuidv4();
          text = text.replace(
            /(INSERT\s+(?:OR\s+\w+\s+)?INTO\s+\w+\s*)\(([^)]+)\)\s*(VALUES\s*)\(/i,
            `$1(id, $2) $3('${autoId}', `
          );
        }
      }

      const hasReturning = /\bRETURNING\b/i.test(text);
      if (hasReturning) {
        // sql.js 1.14.1 bundles SQLite 3.49 which supports RETURNING natively
        const stmt = db.prepare(text);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        stmt.free();
        saveDatabase();
        return { rows, rowCount: rows.length };
      } else {
        db.run(text, params);
        saveDatabase();
        return { rows: [], rowCount: 0, result: null };
      }
    }
  } catch (err) {
    logger.error('Erreur SQL:', { query: text.substring(0, 200), error: err.message });
    throw err;
  }
};

/**
 * Exécute plusieurs requêtes dans une transaction
 * Passe un objet client compatible avec l'API pg pour la rétrocompatibilité
 */
const transaction = async (callback) => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  // Pseudo-client pour la compatibilité avec le code PostgreSQL existant
  const client = { query: async (text, params) => query(text, params) };

  try {
    db.run('BEGIN');
    const result = await callback(client);
    db.run('COMMIT');
    saveDatabase();
    return result;
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
};

/**
 * Ferme la connexion et sauvegarde
 */
const close = () => {
  if (db) {
    saveDatabase();
    logger.info('Connexion SQLite fermée');
  }
};

function getDb() {
  return db;
}

module.exports = { 
  query, 
  transaction, 
  db, 
  close,
  initializeDatabase,
  saveDatabase,
  getDb
};
