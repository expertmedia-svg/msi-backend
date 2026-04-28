-- ============================================================
-- MSI Burkina Faso – Système de Gestion Logistique
-- Script SQL : Schéma SQLite
-- Version : 1.0.0 | Date : 2026
-- ============================================================

-- ============================================================
-- SCHÉMA : Sécurité & Utilisateurs
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    libelle VARCHAR(100) NOT NULL,
    permissions TEXT DEFAULT '{}',
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

CREATE TABLE IF NOT EXISTS journaux_connexion (
    id TEXT PRIMARY KEY,
    utilisateur_id TEXT REFERENCES utilisateurs(id),
    action VARCHAR(50) NOT NULL,
    adresse_ip VARCHAR(45),
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tokens_reinitialisation (
    id TEXT PRIMARY KEY,
    utilisateur_id TEXT REFERENCES utilisateurs(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expire_le DATETIME NOT NULL,
    utilise BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SCHÉMA : Référentiels
-- ============================================================

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

-- ============================================================
-- SCHÉMA : Module Achats / Approvisionnements
-- ============================================================

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

CREATE TABLE IF NOT EXISTS fournisseurs_documents (
    id TEXT PRIMARY KEY,
    fournisseur_id TEXT REFERENCES fournisseurs(id) ON DELETE CASCADE,
    type_document VARCHAR(100),
    nom_fichier VARCHAR(255),
    chemin_fichier VARCHAR(500),
    date_expiration DATE,
    uploaded_by TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fournisseurs_evaluations (
    id TEXT PRIMARY KEY,
    fournisseur_id TEXT REFERENCES fournisseurs(id) ON DELETE CASCADE,
    commande_id TEXT,
    note_delais REAL,
    note_qualite REAL,
    note_conformite REAL,
    note_communication REAL,
    note_globale REAL,
    commentaire TEXT,
    fraude_signalee BOOLEAN DEFAULT FALSE,
    detail_fraude TEXT,
    evalue_par TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seuils_achat (
    id TEXT PRIMARY KEY,
    libelle VARCHAR(100) NOT NULL,
    montant_min REAL DEFAULT 0,
    montant_max REAL,
    procedure VARCHAR(100) NOT NULL,
    nb_devis_requis INT DEFAULT 1,
    actif BOOLEAN DEFAULT TRUE
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

CREATE TABLE IF NOT EXISTS articles_prix_historique (
    id TEXT PRIMARY KEY,
    article_id TEXT REFERENCES articles(id) ON DELETE CASCADE,
    fournisseur_id TEXT REFERENCES fournisseurs(id),
    prix REAL NOT NULL,
    devise_id TEXT REFERENCES devises(id),
    date_prix DATE NOT NULL,
    source VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS demandes_achat (
    id TEXT PRIMARY KEY,
    numero VARCHAR(50) UNIQUE NOT NULL,
    titre VARCHAR(200) NOT NULL,
    demandeur_id TEXT REFERENCES utilisateurs(id),
    site_id TEXT REFERENCES sites(id),
    projet_id TEXT REFERENCES projets(id),
    ligne_budgetaire_id TEXT REFERENCES lignes_budgetaires(id),
    statut VARCHAR(50) DEFAULT 'brouillon',
    priorite VARCHAR(20) DEFAULT 'normale',
    date_besoin DATE,
    justification TEXT,
    commentaire_rejet TEXT,
    montant_estime REAL DEFAULT 0,
    procedure_applicable VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS demandes_achat_lignes (
    id TEXT PRIMARY KEY,
    demande_id TEXT REFERENCES demandes_achat(id) ON DELETE CASCADE,
    article_id TEXT REFERENCES articles(id),
    description VARCHAR(500),
    quantite REAL NOT NULL,
    unite_mesure VARCHAR(50),
    prix_unitaire_estime REAL,
    ordre INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS validations_achat (
    id TEXT PRIMARY KEY,
    demande_id TEXT REFERENCES demandes_achat(id) ON DELETE CASCADE,
    niveau INT NOT NULL,
    validateur_id TEXT REFERENCES utilisateurs(id),
    statut VARCHAR(20) DEFAULT 'en_attente',
    commentaire TEXT,
    date_validation DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS demandes_devis (
    id TEXT PRIMARY KEY,
    numero VARCHAR(50) UNIQUE NOT NULL,
    demande_achat_id TEXT REFERENCES demandes_achat(id),
    statut VARCHAR(50) DEFAULT 'ouvert',
    date_limite_reponse DATETIME,
    created_by TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS demandes_devis_fournisseurs (
    id TEXT PRIMARY KEY,
    demande_devis_id TEXT REFERENCES demandes_devis(id) ON DELETE CASCADE,
    fournisseur_id TEXT REFERENCES fournisseurs(id),
    statut VARCHAR(50) DEFAULT 'envoye',
    date_envoi DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_reponse DATETIME,
    token_acces VARCHAR(255) UNIQUE
);

CREATE TABLE IF NOT EXISTS offres_fournisseurs (
    id TEXT PRIMARY KEY,
    ddq_fournisseur_id TEXT REFERENCES demandes_devis_fournisseurs(id) ON DELETE CASCADE,
    delai_livraison_jours INT,
    conditions_paiement TEXT,
    validite_offre_jours INT,
    note_technique TEXT,
    fichier_proforma_url VARCHAR(500),
    soumis_le DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS offres_lignes (
    id TEXT PRIMARY KEY,
    offre_id TEXT REFERENCES offres_fournisseurs(id) ON DELETE CASCADE,
    demande_ligne_id TEXT REFERENCES demandes_achat_lignes(id),
    quantite_disponible REAL,
    prix_unitaire REAL NOT NULL,
    devise_id TEXT REFERENCES devises(id),
    prix_unitaire_fcfa REAL,
    commentaire VARCHAR(500)
);

CREATE TABLE IF NOT EXISTS bons_commande (
    id TEXT PRIMARY KEY,
    numero VARCHAR(50) UNIQUE NOT NULL,
    demande_achat_id TEXT REFERENCES demandes_achat(id),
    fournisseur_id TEXT REFERENCES fournisseurs(id),
    projet_id TEXT REFERENCES projets(id),
    ligne_budgetaire_id TEXT REFERENCES lignes_budgetaires(id),
    statut VARCHAR(50) DEFAULT 'brouillon',
    date_commande DATE DEFAULT CURRENT_DATE,
    date_livraison_prevue DATE,
    lieu_livraison TEXT,
    conditions_paiement TEXT,
    montant_ht REAL DEFAULT 0,
    montant_ttc REAL DEFAULT 0,
    devise_id TEXT REFERENCES devises(id),
    taux_change REAL DEFAULT 1,
    notes TEXT,
    valide_par TEXT REFERENCES utilisateurs(id),
    date_validation DATETIME,
    created_by TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bons_commande_lignes (
    id TEXT PRIMARY KEY,
    commande_id TEXT REFERENCES bons_commande(id) ON DELETE CASCADE,
    article_id TEXT REFERENCES articles(id),
    description VARCHAR(500),
    quantite_commandee REAL NOT NULL,
    quantite_recue REAL DEFAULT 0,
    prix_unitaire REAL NOT NULL,
    unite_mesure VARCHAR(50),
    ordre INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS receptions (
    id TEXT PRIMARY KEY,
    numero VARCHAR(50) UNIQUE NOT NULL,
    commande_id TEXT REFERENCES bons_commande(id),
    site_id TEXT REFERENCES sites(id),
    date_reception DATE DEFAULT CURRENT_DATE,
    statut VARCHAR(50) DEFAULT 'en_cours',
    bon_livraison_numero VARCHAR(100),
    bon_livraison_photo_url VARCHAR(500),
    echantillon_valide BOOLEAN,
    echantillon_valide_par TEXT REFERENCES utilisateurs(id),
    non_conformites TEXT,
    reclamation_fournisseur BOOLEAN DEFAULT FALSE,
    detail_reclamation TEXT,
    recu_par TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS receptions_lignes (
    id TEXT PRIMARY KEY,
    reception_id TEXT REFERENCES receptions(id) ON DELETE CASCADE,
    commande_ligne_id TEXT REFERENCES bons_commande_lignes(id),
    article_id TEXT REFERENCES articles(id),
    quantite_recue REAL NOT NULL,
    quantite_acceptee REAL DEFAULT 0,
    quantite_rejetee REAL DEFAULT 0,
    motif_rejet TEXT,
    numero_lot VARCHAR(100),
    date_peremption DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SCHÉMA : Module Stocks
-- ============================================================

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

CREATE TABLE IF NOT EXISTS stocks (
    id TEXT PRIMARY KEY,
    article_id TEXT REFERENCES articles(id),
    magasin_id TEXT REFERENCES magasins(id),
    emplacement_id TEXT REFERENCES emplacements(id),
    quantite REAL DEFAULT 0,
    stock_min REAL DEFAULT 0,
    stock_max REAL DEFAULT 0,
    stock_securite REAL DEFAULT 0,
    cump REAL DEFAULT 0,
    cmm REAL DEFAULT 0,
    valeur_totale REAL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(article_id, magasin_id, emplacement_id)
);

CREATE TABLE IF NOT EXISTS lots (
    id TEXT PRIMARY KEY,
    article_id TEXT REFERENCES articles(id),
    magasin_id TEXT REFERENCES magasins(id),
    emplacement_id TEXT REFERENCES emplacements(id),
    numero_lot VARCHAR(100) NOT NULL,
    quantite REAL DEFAULT 0,
    date_peremption DATE,
    date_reception DATE DEFAULT CURRENT_DATE,
    prix_unitaire REAL,
    source VARCHAR(50),
    statut VARCHAR(50) DEFAULT 'disponible',
    reception_id TEXT REFERENCES receptions(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mouvements_stock (
    id TEXT PRIMARY KEY,
    type_mouvement VARCHAR(50) NOT NULL,
    article_id TEXT REFERENCES articles(id),
    lot_id TEXT REFERENCES lots(id),
    magasin_source_id TEXT REFERENCES magasins(id),
    magasin_dest_id TEXT REFERENCES magasins(id),
    emplacement_source_id TEXT REFERENCES emplacements(id),
    emplacement_dest_id TEXT REFERENCES emplacements(id),
    quantite REAL NOT NULL,
    prix_unitaire REAL,
    valeur REAL,
    reference_document VARCHAR(100),
    projet_id TEXT REFERENCES projets(id),
    destinataire VARCHAR(200),
    motif TEXT,
    justificatif_url VARCHAR(500),
    saisi_par TEXT REFERENCES utilisateurs(id),
    valide_par TEXT REFERENCES utilisateurs(id),
    date_mouvement DATETIME DEFAULT CURRENT_TIMESTAMP,
    synced_offline BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventaires (
    id TEXT PRIMARY KEY,
    numero VARCHAR(50) UNIQUE NOT NULL,
    magasin_id TEXT REFERENCES magasins(id),
    type_inventaire VARCHAR(50) DEFAULT 'cyclique',
    statut VARCHAR(50) DEFAULT 'en_cours',
    date_debut DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_fin DATETIME,
    cree_par TEXT REFERENCES utilisateurs(id),
    valide_par TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventaires_lignes (
    id TEXT PRIMARY KEY,
    inventaire_id TEXT REFERENCES inventaires(id) ON DELETE CASCADE,
    article_id TEXT REFERENCES articles(id),
    lot_id TEXT REFERENCES lots(id),
    quantite_theorique REAL DEFAULT 0,
    quantite_comptee REAL,
    ecart REAL,
    valeur_ecart REAL,
    commentaire TEXT,
    compte_par TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alertes_stock (
    id TEXT PRIMARY KEY,
    type_alerte VARCHAR(50) NOT NULL,
    article_id TEXT REFERENCES articles(id),
    magasin_id TEXT REFERENCES magasins(id),
    lot_id TEXT REFERENCES lots(id),
    message TEXT NOT NULL,
    seuil_valeur REAL,
    valeur_actuelle REAL,
    statut VARCHAR(20) DEFAULT 'active',
    acquittee_par TEXT REFERENCES utilisateurs(id),
    date_acquittement DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SCHÉMA : Module Équipements (Assets)
-- ============================================================

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
    reception_id TEXT REFERENCES receptions(id),
    created_by TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS equipements_affectations (
    id TEXT PRIMARY KEY,
    equipement_id TEXT REFERENCES equipements(id) ON DELETE CASCADE,
    utilisateur_id TEXT REFERENCES utilisateurs(id),
    site_id TEXT REFERENCES sites(id),
    localisation_physique VARCHAR(200),
    date_affectation DATE NOT NULL,
    date_retour DATE,
    statut VARCHAR(20) DEFAULT 'actif',
    fiche_affectation_url VARCHAR(500),
    affecter_par TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS equipements_sorties (
    id TEXT PRIMARY KEY,
    equipement_id TEXT REFERENCES equipements(id),
    type_sortie VARCHAR(50) NOT NULL,
    date_sortie DATE NOT NULL,
    valeur_cession REAL,
    beneficiaire VARCHAR(200),
    motif TEXT,
    pv_url VARCHAR(500),
    bordereau_url VARCHAR(500),
    rapport_police_url VARCHAR(500),
    texte_plainte TEXT,
    valide_par TEXT REFERENCES utilisateurs(id),
    created_by TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SCHÉMA : Module Flotte Motorisée
-- ============================================================

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

CREATE TABLE IF NOT EXISTS vehicules_documents (
    id TEXT PRIMARY KEY,
    vehicule_id TEXT REFERENCES vehicules(id) ON DELETE CASCADE,
    type_document VARCHAR(100),
    nom_fichier VARCHAR(255),
    chemin_fichier VARCHAR(500),
    date_expiration DATE,
    uploaded_by TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conducteurs_autorises (
    id TEXT PRIMARY KEY,
    utilisateur_id TEXT REFERENCES utilisateurs(id),
    numero_permis VARCHAR(100) NOT NULL,
    categorie_permis VARCHAR(20),
    date_expiration_permis DATE,
    permis_scan_url VARCHAR(500),
    actif BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY,
    numero VARCHAR(50) UNIQUE NOT NULL,
    vehicule_id TEXT REFERENCES vehicules(id),
    conducteur_id TEXT REFERENCES conducteurs_autorises(id),
    site_depart_id TEXT REFERENCES sites(id),
    destination TEXT NOT NULL,
    date_depart DATETIME NOT NULL,
    date_retour_prevue DATETIME,
    date_retour_reelle DATETIME,
    km_depart INT,
    km_retour INT,
    objectif TEXT,
    statut VARCHAR(20) DEFAULT 'planifiee',
    passagers TEXT,
    created_by TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fiches_suivi_journalier (
    id TEXT PRIMARY KEY,
    vehicule_id TEXT REFERENCES vehicules(id),
    date_fiche DATE NOT NULL,
    mission_id TEXT REFERENCES missions(id),
    etat_general VARCHAR(20),
    niveaux_huile BOOLEAN,
    niveaux_eau BOOLEAN,
    pression_pneus BOOLEAN,
    freins_ok BOOLEAN,
    eclairage_ok BOOLEAN,
    essuie_glaces_ok BOOLEAN,
    carrosserie_ok BOOLEAN,
    km_debut INT,
    km_fin INT,
    carburant_debut_litres REAL,
    carburant_ajoute_litres REAL,
    carburant_fin_litres REAL,
    anomalies TEXT,
    rempli_par TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS approvisionnements_carburant (
    id TEXT PRIMARY KEY,
    vehicule_id TEXT REFERENCES vehicules(id),
    date_approvisionnement DATE DEFAULT CURRENT_DATE,
    quantite_litres REAL NOT NULL,
    prix_unitaire REAL,
    montant_total REAL,
    fournisseur_carburant VARCHAR(100),
    bon_carburant_numero VARCHAR(100),
    km_compteur INT,
    mission_id TEXT REFERENCES missions(id),
    saisi_par TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS maintenances (
    id TEXT PRIMARY KEY,
    vehicule_id TEXT REFERENCES vehicules(id),
    type_service VARCHAR(10),
    type_maintenance VARCHAR(50),
    description TEXT NOT NULL,
    date_realisation DATE NOT NULL,
    km_compteur INT,
    garage_nom VARCHAR(200),
    montant REAL,
    prochaine_maintenance_km INT,
    prochaine_maintenance_date DATE,
    facture_url VARCHAR(500),
    realise_par TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS incidents_vehicule (
    id TEXT PRIMARY KEY,
    vehicule_id TEXT REFERENCES vehicules(id),
    type_incident VARCHAR(50),
    date_incident DATE NOT NULL,
    lieu TEXT,
    description TEXT NOT NULL,
    conducteur_id TEXT REFERENCES conducteurs_autorises(id),
    blessures BOOLEAN DEFAULT FALSE,
    degats_materiels BOOLEAN DEFAULT FALSE,
    estimation_degats REAL,
    rapport_police_numero VARCHAR(100),
    rapport_police_url VARCHAR(500),
    statut VARCHAR(50) DEFAULT 'ouvert',
    resolu_le DATETIME,
    note_resolution TEXT,
    saisi_par TEXT REFERENCES utilisateurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INDEX pour performances
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_utilisateurs_email ON utilisateurs(email);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_role ON utilisateurs(role_id);
CREATE INDEX IF NOT EXISTS idx_fournisseurs_categorie ON fournisseurs(categorie_id);
CREATE INDEX IF NOT EXISTS idx_fournisseurs_liste_noire ON fournisseurs(liste_noire);
CREATE INDEX IF NOT EXISTS idx_articles_categorie ON articles(categorie);
CREATE INDEX IF NOT EXISTS idx_demandes_achat_statut ON demandes_achat(statut);
CREATE INDEX IF NOT EXISTS idx_demandes_achat_demandeur ON demandes_achat(demandeur_id);
CREATE INDEX IF NOT EXISTS idx_bons_commande_statut ON bons_commande(statut);
CREATE INDEX IF NOT EXISTS idx_bons_commande_fournisseur ON bons_commande(fournisseur_id);
CREATE INDEX IF NOT EXISTS idx_stocks_article_magasin ON stocks(article_id, magasin_id);
CREATE INDEX IF NOT EXISTS idx_lots_article ON lots(article_id);
CREATE INDEX IF NOT EXISTS idx_lots_peremption ON lots(date_peremption);
CREATE INDEX IF NOT EXISTS idx_lots_statut ON lots(statut);
CREATE INDEX IF NOT EXISTS idx_mouvements_article ON mouvements_stock(article_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_date ON mouvements_stock(date_mouvement);
CREATE INDEX IF NOT EXISTS idx_mouvements_magasin ON mouvements_stock(magasin_source_id, magasin_dest_id);
CREATE INDEX IF NOT EXISTS idx_equipements_categorie ON equipements(categorie_id);
CREATE INDEX IF NOT EXISTS idx_equipements_statut ON equipements(statut);
CREATE INDEX IF NOT EXISTS idx_vehicules_immatriculation ON vehicules(immatriculation);
CREATE INDEX IF NOT EXISTS idx_alertes_statut ON alertes_stock(statut);
CREATE INDEX IF NOT EXISTS idx_alertes_type ON alertes_stock(type_alerte);
CREATE INDEX IF NOT EXISTS idx_journaux_utilisateur ON journaux_connexion(utilisateur_id);
CREATE INDEX IF NOT EXISTS idx_journaux_date ON journaux_connexion(created_at);
