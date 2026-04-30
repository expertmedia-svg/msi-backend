
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function inspectDb() {
  const SQL = await initSqlJs();
  const dbName = process.env.DB_NAME || 'msi_gestion';
  const dbPath = path.join(__dirname, 'data', dbName);
  
  const filebuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(filebuffer);
  
  const rolesRes = db.exec("SELECT id, code FROM roles");
  const rolesMap = {};
  rolesRes[0].values.forEach(row => {
    rolesMap[row[0]] = row[1];
  });

  const usersRes = db.exec("SELECT email, role_id FROM utilisateurs");
  usersRes[0].values.forEach(row => {
    console.log(`${row[0]} -> role_code: ${rolesMap[row[1]]}`);
  });
}

inspectDb();
