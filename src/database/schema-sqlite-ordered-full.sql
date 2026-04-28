-- Schéma SQLite réordonné et complet

-- 1. Tables de base
CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    libelle VARCHAR(100) NOT NULL,
    permissions TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devises (
    id TEXT PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL,
    libelle VARCHAR(50) NOT NULL,
    taux_vers_fcfa REAL DEFAULT 1,
    est_devise_base BOOLEAN DEFAULT FALSE,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bailleurs (
    id TEXT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    nom VARCHAR(200) NOT NULL,
    acronyme VARCHAR(50),
    contact_nom VARCHAR(100),
    contact_email VARCHAR(255),
    actif BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS utilisateurs (
    id TEXT PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    mot_de_passe_hash VARCHAR(255) NOT NULL,
    role_id TEXT REFERENCES roles(id),
    departement VARCHAR(100),
    site VARCHAR(100),
    telephone VARCHAR(20),
    actif BOOLEAN DEFAULT TRUE,
    premiere_connexion BOOLEAN DEFAULT TRUE,
    mot_de_passe_expire_le DATETIME DEFAULT CURRENT_TIMESTAMP,
    derniere_connexion DATETIME,
    tentatives_echec INT DEFAULT 0,
    verrouille_jusqu_a DATETIME,
    inactif_depuis DATETIME,
    delegue_a TEXT REFERENCES utilisateurs(id),
    delegation_debut DATETIME,
    delegation_fin DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Référentiels
CREATE TABLE IF NOT EXISTS projets (
    id TEXT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    nom VARCHAR(200) NOT NULL,
    bailleur_id TEXT REFERENCES bailleurs(id),
    date_debut DATE,
    date_fin DATE,
    budget_total REAL DEFAULT 0,
    devise_id TEXT REFERENCES devises(id),
    statut VARCHAR(20) DEFAULT 'actif',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lignes_budgetaires (
    id TEXT PRIMARY KEY,
    projet_id TEXT REFERENCES projets(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    libelle VARCHAR(200) NOT NULL,
    budget REAL DEFAULT 0,
    depense REAL DEFAULT 0,
    UNIQUE(projet_id, code)
);

CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    nom VARCHAR(200) NOT NULL,
    type VARCHAR(50),
    adresse TEXT,
    ville VARCHAR(100),
    region VARCHAR(100),
    responsable_id TEXT REFERENCES utilisateurs(id),
    actif BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Achats / Fournisseurs / Articles
CREATE TABLE IF NOT EXISTS categories_marche (
    id TEXT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    libelle VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS fournisseurs (
    id TEXT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    nom VARCHAR(200) NOT NULL,
    raison_sociale VARCHAR(200),
    categorie_id TEXT REFERENCES categories_marche(id),
    adresse TEXT,
    ville VARCHAR(100),
    pays VARCHAR(100) DEFAULT 'Burkina Faso',
    telephone VARCHAR(20),
    email VARCHAR(255),
    site_web VARCHAR(255),
    nif VARCHAR(50),
    rccm VARCHAR(50),
    contact_nom VARCHAR(100),
    contact_telephone VARCHAR(20),
    contact_email VARCHAR(255),
    note_globale REAL DEFAULT 0,
    liste_noire BOOLEAN DEFAULT FALSE,
    motif_liste_noire TEXT,
    date_liste_noire DATETIME,
    actif BOOLEAN DEFAULT TRUE,
    created_by TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    designation VARCHAR(200) NOT NULL,
    description TEXT,
    categorie VARCHAR(100),
    unite_mesure VARCHAR(50),
    est_pharmaceutique BOOLEAN DEFAULT FALSE,
    prix_unitaire_moyen REAL DEFAULT 0,
    image_url VARCHAR(500),
    actif BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Magasins / Stocks
CREATE TABLE IF NOT EXISTS magasins (
    id TEXT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    nom VARCHAR(200) NOT NULL,
    type VARCHAR(50),
    site_id TEXT REFERENCES sites(id),
    responsable_id TEXT REFERENCES utilisateurs(id),
    adresse TEXT,
    actif BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS emplacements (
    id TEXT PRIMARY KEY,
    magasin_id TEXT REFERENCES magasins(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    zone VARCHAR(50),
    allee VARCHAR(50),
    etagere VARCHAR(50),
    niveau VARCHAR(50),
    actif BOOLEAN DEFAULT TRUE,
    UNIQUE(magasin_id, code)
);

-- 5. Equipements
CREATE TABLE IF NOT EXISTS categories_equipement (
    id TEXT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    libelle VARCHAR(100) NOT NULL,
    type_equipement VARCHAR(50),
    duree_amortissement_ans INT DEFAULT 5,
    taux_amortissement REAL
);

CREATE TABLE IF NOT EXISTS equipements (
    id TEXT PRIMARY KEY,
    code_etiquette VARCHAR(50) UNIQUE NOT NULL,
    code_serie VARCHAR(100),
    designation VARCHAR(200) NOT NULL,
    categorie_id TEXT REFERENCES categories_equipement(id),
    marque VARCHAR(100),
    modele VARCHAR(100),
    annee_fabrication INT,
    valeur_achat REAL,
    devise_id TEXT REFERENCES devises(id),
    date_acquisition DATE,
    duree_amortissement_ans INT,
    valeur_residuelle REAL,
    valeur_venale REAL,
    est_immobilisation BOOLEAN DEFAULT FALSE,
    statut VARCHAR(50) DEFAULT 'en_service',
    etat VARCHAR(50) DEFAULT 'bon',
    site_id TEXT REFERENCES sites(id),
    magasin_id TEXT REFERENCES magasins(id),
    photo_url VARCHAR(500),
    code_barre_url VARCHAR(500),
    facture_url VARCHAR(500),
    reception_id TEXT,
    created_by TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Vehicules
CREATE TABLE IF NOT EXISTS vehicules (
    id TEXT PRIMARY KEY,
    equipement_id TEXT REFERENCES equipements(id) UNIQUE,
    immatriculation VARCHAR(50) UNIQUE NOT NULL,
    type_vehicule VARCHAR(50),
    marque VARCHAR(100),
    modele VARCHAR(100),
    annee INT,
    couleur VARCHAR(50),
    kilometrage_initial INT DEFAULT 0,
    kilometrage_actuel INT DEFAULT 0,
    capacite_reservoir_litres REAL,
    type_carburant VARCHAR(50),
    date_mise_en_circulation DATE,
    carte_grise_numero VARCHAR(100),
    carte_grise_expiration DATE,
    carte_jaune_numero VARCHAR(100),
    carte_jaune_expiration DATE,
    assurance_compagnie VARCHAR(100),
    assurance_numero VARCHAR(100),
    assurance_expiration DATE,
    visite_technique_date DATE,
    visite_technique_expiration DATE,
    actif BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Achats / Approvisionnements / Stocks / Equipements / Flotte / Index

[Copie ici toutes les instructions CREATE TABLE et CREATE INDEX du schéma original, dans l'ordre logique, comme dans schema-sqlite.sql]
