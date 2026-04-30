
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function inspectDb() {
  const SQL = await initSqlJs();
  const dbName = process.env.DB_NAME || 'msi_gestion';
  const dbPath = path.join(__dirname, 'data', dbName);
  
  console.log('Using dbPath:', dbPath);
  if (!fs.existsSync(dbPath)) {
    console.error('Database not found at', dbPath);
    return;
  }
  
  const filebuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(filebuffer);
  
  console.log('--- ROLES ---');
  const roles = db.exec("SELECT id, code, libelle FROM roles");
  if (roles.length > 0) {
    roles[0].values.forEach(row => {
      console.log(`- ${row[1]} (${row[2]})`);
    });
  } else {
    console.log('No roles found.');
  }

  console.log('\n--- UTILISATEURS ---');
  const users = db.exec("SELECT email, nom, prenom, role_id FROM utilisateurs");
  if (users.length > 0) {
    users[0].values.forEach(row => {
      console.log(`- ${row[0]} (${row[1]} ${row[2]}) - RoleID: ${row[3]}`);
    });
  } else {
    console.log('No users found.');
  }
}

inspectDb();
