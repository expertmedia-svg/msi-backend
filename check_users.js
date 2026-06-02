
require('dotenv').config();
const { initializeDatabase, query } = require('./src/config/database');

async function checkUsers() {
  try {
    await initializeDatabase();
    const result = await query('SELECT email FROM utilisateurs');
    console.log('Users in DB:');
    result.rows.forEach(r => console.log(` - ${r.email}`));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkUsers();
