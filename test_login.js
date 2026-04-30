
const bcrypt = require('bcrypt');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function testLogin(email, password) {
  const SQL = await initSqlJs();
  const dbName = process.env.DB_NAME || 'msi_gestion';
  const dbPath = path.join(__dirname, 'data', dbName);
  
  if (!fs.existsSync(dbPath)) {
    console.error('Database not found');
    return;
  }
  
  const filebuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(filebuffer);
  
  const res = db.exec("SELECT mot_de_passe_hash FROM utilisateurs WHERE email = ?", [email.toLowerCase().trim()]);
  if (res.length === 0 || res[0].values.length === 0) {
    console.log(`User ${email} NOT FOUND`);
    return;
  }
  
  const hash = res[0].values[0][0];
  const match = await bcrypt.compare(password, hash);
  console.log(`Login test for ${email} with password "${password}": ${match ? 'SUCCESS' : 'FAILED'}`);
}

(async () => {
  await testLogin('adminmsi@mariestopes-bf.org', 'mariestop');
  await testLogin('directeur@msi.bf', 'directeur');
  await testLogin('admin@msi.bf', 'admin');
})();
