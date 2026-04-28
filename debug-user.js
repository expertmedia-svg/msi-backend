const { initializeDatabase, getDb } = require('./src/config/database');

(async () => {
  await initializeDatabase();
  const db = getDb();
  
  // Check admin user
  const rows = db.exec('SELECT id, email, actif, mot_de_passe_hash FROM utilisateurs WHERE email = "adminmsi@mariestopes-bf.org" LIMIT 1');
  if (rows.length && rows[0].values.length) {
    const [id, email, actif, hash] = rows[0].values[0];
    console.log('Found user:');
    console.log('  ID:', id);
    console.log('  Email:', email);
    console.log('  Actif:', actif, '(should be 1)');
    console.log('  Hash exists:', !!hash);
  } else {
    console.log('User not found!');
    console.log('All users:');
    const allRows = db.exec('SELECT email, actif FROM utilisateurs');
    if (allRows.length && allRows[0].values.length) {
      allRows[0].values.forEach(([email, actif]) => {
        console.log(`  - ${email}: actif=${actif}`);
      });
    }
  }
})();
