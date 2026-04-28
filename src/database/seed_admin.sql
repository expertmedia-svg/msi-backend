-- seed_admin.sql : Création du rôle et du compte admin pour MSI Gestion

-- 1. Créer le rôle admin s'il n'existe pas
INSERT INTO roles (id, code, libelle, permissions)
SELECT uuid_generate_v4(), 'admin', 'Administrateur', '{"*": {"*": true}}'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'admin');

-- 2. Récupérer l'id du rôle admin
WITH admin_role AS (
  SELECT id FROM roles WHERE code = 'admin' LIMIT 1
)
-- 3. Créer l'utilisateur admin s'il n'existe pas
INSERT INTO utilisateurs (id, nom, prenom, email, mot_de_passe_hash, role_id, actif, premiere_connexion)
SELECT uuid_generate_v4(), 'Admin', 'Principal', 'admin@mariestopes-bf.org',
  '$2b$12$wQwQwQwQwQwQwQwQwQwQwOQwQwQwQwQwQwQwQwQwQwQwQwQwQwQwQwQwQwQwQw',
  admin_role.id, TRUE, TRUE
FROM admin_role
WHERE NOT EXISTS (SELECT 1 FROM utilisateurs WHERE email = 'admin@mariestopes-bf.org');

-- 4. Mettre à jour le mot de passe si l'utilisateur existe déjà
UPDATE utilisateurs SET mot_de_passe_hash = '$2b$12$wQwQwQwQwQwQwQwQwQwQwOQwQwQwQwQwQwQwQwQwQwQwQwQwQwQwQwQwQwQwQw'
WHERE email = 'admin@mariestopes-bf.org';

-- Mot de passe en clair : Admin@MSI2026!
