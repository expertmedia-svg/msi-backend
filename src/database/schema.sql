-- ============================================================
-- MSI Burkina Faso – Système de Gestion Logistique
-- Script SQL : Schéma complet PostgreSQL
-- Version : 1.0.0 | Date : 2026
-- ============================================================

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- SCHÉMA : Sécurité & Utilisateurs
-- ============================================================

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,        -- 'admin', 'gestionnaire_achats', 'magasinier', etc.
    libelle VARCHAR(100) NOT NULL,
    permissions JSONB DEFAULT '{}',           -- {module: {action: bool}}
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE utilisateurs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    mot_de_passe_hash VARCHAR(255) NOT NULL,
    role_id UUID REFERENCES roles(id),
    departement VARCHAR(100),
    site VARCHAR(100),                        -- CSO, MS Ladies, magasin central, etc.
    telephone VARCHAR(20),
    actif BOOLEAN DEFAULT TRUE,
    premiere_connexion BOOLEAN DEFAULT TRUE,
    mot_de_passe_expire_le TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
    derniere_connexion TIMESTAMPTZ,
    tentatives_echec INT DEFAULT 0,
    verrouille_jusqu_a TIMESTAMPTZ,
    inactif_depuis TIMESTAMPTZ,
    delegue_a UUID REFERENCES utilisateurs(id),  -- délégation d'autorisation
    delegation_debut TIMESTAMPTZ,
    delegation_fin TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE journaux_connexion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    utilisateur_id UUID REFERENCES utilisateurs(id),
    action VARCHAR(50) NOT NULL,             -- 'connexion', 'deconnexion', 'echec', 'verrouillage'
    adresse_ip INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tokens_reinitialisation (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    utilisateur_id UUID REFERENCES utilisateurs(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expire_le TIMESTAMPTZ NOT NULL,
    utilise BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SCHÉMA : Référentiels
-- ============================================================

CREATE TABLE devises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(10) UNIQUE NOT NULL,        -- 'FCFA', 'USD', 'EUR', 'GBP', 'CAD'
    libelle VARCHAR(50) NOT NULL,
    taux_vers_fcfa NUMERIC(15,6) DEFAULT 1,
    est_devise_base BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bailleurs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    nom VARCHAR(200) NOT NULL,
    acronyme VARCHAR(50),
    contact_nom VARCHAR(100),
    contact_email VARCHAR(255),
    actif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    nom VARCHAR(200) NOT NULL,
    bailleur_id UUID REFERENCES bailleurs(id),
    date_debut DATE,
    date_fin DATE,
    budget_total NUMERIC(15,2) DEFAULT 0,
    devise_id UUID REFERENCES devises(id),
    statut VARCHAR(20) DEFAULT 'actif',      -- 'actif', 'clos', 'suspendu'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lignes_budgetaires (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    projet_id UUID REFERENCES projets(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    libelle VARCHAR(200) NOT NULL,
    budget NUMERIC(15,2) DEFAULT 0,
    depense NUMERIC(15,2) DEFAULT 0,
    UNIQUE(projet_id, code)
);

CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    nom VARCHAR(200) NOT NULL,
    type VARCHAR(50),                        -- 'central', 'regional', 'point_service'
    adresse TEXT,
    ville VARCHAR(100),
    region VARCHAR(100),
    responsable_id UUID REFERENCES utilisateurs(id),
    actif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SCHÉMA : Module Achats / Approvisionnements
-- ============================================================

CREATE TABLE categories_marche (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    libelle VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE fournisseurs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,        -- code auto-généré
    nom VARCHAR(200) NOT NULL,
    raison_sociale VARCHAR(200),
    categorie_id UUID REFERENCES categories_marche(id),
    adresse TEXT,
    ville VARCHAR(100),
    pays VARCHAR(100) DEFAULT 'Burkina Faso',
    telephone VARCHAR(20),
    email VARCHAR(255),
    site_web VARCHAR(255),
    nif VARCHAR(50),                         -- numéro identification fiscale
    rccm VARCHAR(50),
    contact_nom VARCHAR(100),
    contact_telephone VARCHAR(20),
    contact_email VARCHAR(255),
    note_globale NUMERIC(3,2) DEFAULT 0,     -- calculée automatiquement
    liste_noire BOOLEAN DEFAULT FALSE,
    motif_liste_noire TEXT,
    date_liste_noire TIMESTAMPTZ,
    actif BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES utilisateurs(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fournisseurs_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fournisseur_id UUID REFERENCES fournisseurs(id) ON DELETE CASCADE,
    type_document VARCHAR(100),              -- 'registre_commerce', 'attestation_fiscale', etc.
    nom_fichier VARCHAR(255),
    chemin_fichier VARCHAR(500),
    date_expiration DATE,
    uploaded_by UUID REFERENCES utilisateurs(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fournisseurs_evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fournisseur_id UUID REFERENCES fournisseurs(id) ON DELETE CASCADE,
    commande_id UUID,                        -- référence à la commande évaluée
    note_delais NUMERIC(3,2),
    note_qualite NUMERIC(3,2),
    note_conformite NUMERIC(3,2),
    note_communication NUMERIC(3,2),
    note_globale NUMERIC(3,2),
    commentaire TEXT,
    fraude_signalee BOOLEAN DEFAULT FALSE,
    detail_fraude TEXT,
    evalue_par UUID REFERENCES utilisateurs(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE seuils_achat (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    libelle VARCHAR(100) NOT NULL,
    montant_min NUMERIC(15,2) DEFAULT 0,
    montant_max NUMERIC(15,2),
    procedure VARCHAR(100) NOT NULL,         -- 'devis_unique', 'comparaison_prix', 'ao_local', 'ao_international'
    nb_devis_requis INT DEFAULT 1,
    actif BOOLEAN DEFAULT TRUE
);

CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    designation VARCHAR(200) NOT NULL,
    description TEXT,
    categorie VARCHAR(100),
    unite_mesure VARCHAR(50),
    est_pharmaceutique BOOLEAN DEFAULT FALSE,
    prix_unitaire_moyen NUMERIC(15,2) DEFAULT 0,
    image_url VARCHAR(500),
    actif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE articles_prix_historique (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
    fournisseur_id UUID REFERENCES fournisseurs(id),
    prix NUMERIC(15,2) NOT NULL,
    devise_id UUID REFERENCES devises(id),
    date_prix DATE NOT NULL,
    source VARCHAR(100),                     -- 'commande', 'devis', 'manuel'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE demandes_achat (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero VARCHAR(50) UNIQUE NOT NULL,      -- DA-2026-001
    titre VARCHAR(200) NOT NULL,
    demandeur_id UUID REFERENCES utilisateurs(id),
    site_id UUID REFERENCES sites(id),
    projet_id UUID REFERENCES projets(id),
    ligne_budgetaire_id UUID REFERENCES lignes_budgetaires(id),
    statut VARCHAR(50) DEFAULT 'brouillon',  -- 'brouillon','soumis','en_validation','approuve','rejete','annule'
    priorite VARCHAR(20) DEFAULT 'normale',  -- 'normale','urgente','critique'
    date_besoin DATE,
    justification TEXT,
    commentaire_rejet TEXT,
    montant_estime NUMERIC(15,2) DEFAULT 0,
    procedure_applicable VARCHAR(100),        -- définie automatiquement selon seuil
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE demandes_achat_lignes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    demande_id UUID REFERENCES demandes_achat(id) ON DELETE CASCADE,
    article_id UUID REFERENCES articles(id),
    description VARCHAR(500),
    quantite NUMERIC(10,3) NOT NULL,
    unite_mesure VARCHAR(50),
    prix_unitaire_estime NUMERIC(15,2),
    montant_estime NUMERIC(15,2) GENERATED ALWAYS AS (quantite * prix_unitaire_estime) STORED,
    ordre INT DEFAULT 0
);

CREATE TABLE validations_achat (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    demande_id UUID REFERENCES demandes_achat(id) ON DELETE CASCADE,
    niveau INT NOT NULL,                     -- 1, 2, 3...
    validateur_id UUID REFERENCES utilisateurs(id),
    statut VARCHAR(20) DEFAULT 'en_attente', -- 'en_attente','approuve','rejete'
    commentaire TEXT,
    date_validation TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE demandes_devis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero VARCHAR(50) UNIQUE NOT NULL,      -- DDQ-2026-001
    demande_achat_id UUID REFERENCES demandes_achat(id),
    statut VARCHAR(50) DEFAULT 'ouvert',     -- 'ouvert','clos','annule'
    date_limite_reponse TIMESTAMPTZ,
    created_by UUID REFERENCES utilisateurs(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE demandes_devis_fournisseurs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    demande_devis_id UUID REFERENCES demandes_devis(id) ON DELETE CASCADE,
    fournisseur_id UUID REFERENCES fournisseurs(id),
    statut VARCHAR(50) DEFAULT 'envoye',     -- 'envoye','repondu','relance','sans_reponse'
    date_envoi TIMESTAMPTZ DEFAULT NOW(),
    date_reponse TIMESTAMPTZ,
    token_acces VARCHAR(255) UNIQUE          -- token pour accès fournisseur externe
);

CREATE TABLE offres_fournisseurs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ddq_fournisseur_id UUID REFERENCES demandes_devis_fournisseurs(id) ON DELETE CASCADE,
    delai_livraison_jours INT,
    conditions_paiement TEXT,
    validite_offre_jours INT,
    note_technique TEXT,
    fichier_proforma_url VARCHAR(500),
    soumis_le TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE offres_lignes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    offre_id UUID REFERENCES offres_fournisseurs(id) ON DELETE CASCADE,
    demande_ligne_id UUID REFERENCES demandes_achat_lignes(id),
    quantite_disponible NUMERIC(10,3),
    prix_unitaire NUMERIC(15,2) NOT NULL,
    devise_id UUID REFERENCES devises(id),
    prix_unitaire_fcfa NUMERIC(15,2),         -- calculé
    commentaire VARCHAR(500)
);

CREATE TABLE bons_commande (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero VARCHAR(50) UNIQUE NOT NULL,       -- BC-2026-001
    demande_achat_id UUID REFERENCES demandes_achat(id),
    fournisseur_id UUID REFERENCES fournisseurs(id),
    projet_id UUID REFERENCES projets(id),
    ligne_budgetaire_id UUID REFERENCES lignes_budgetaires(id),
    statut VARCHAR(50) DEFAULT 'brouillon',   -- 'brouillon','confirme','en_cours','livre_partiel','livre_total','annule'
    date_commande DATE DEFAULT CURRENT_DATE,
    date_livraison_prevue DATE,
    lieu_livraison TEXT,
    conditions_paiement TEXT,
    montant_ht NUMERIC(15,2) DEFAULT 0,
    montant_ttc NUMERIC(15,2) DEFAULT 0,
    devise_id UUID REFERENCES devises(id),
    taux_change NUMERIC(15,6) DEFAULT 1,
    notes TEXT,
    valide_par UUID REFERENCES utilisateurs(id),
    date_validation TIMESTAMPTZ,
    created_by UUID REFERENCES utilisateurs(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bons_commande_lignes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    commande_id UUID REFERENCES bons_commande(id) ON DELETE CASCADE,
    article_id UUID REFERENCES articles(id),
    description VARCHAR(500),
    quantite_commandee NUMERIC(10,3) NOT NULL,
    quantite_recue NUMERIC(10,3) DEFAULT 0,
    prix_unitaire NUMERIC(15,2) NOT NULL,
    montant NUMERIC(15,2) GENERATED ALWAYS AS (quantite_commandee * prix_unitaire) STORED,
    unite_mesure VARCHAR(50),
    ordre INT DEFAULT 0
);

CREATE TABLE receptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero VARCHAR(50) UNIQUE NOT NULL,       -- REC-2026-001
    commande_id UUID REFERENCES bons_commande(id),
    site_id UUID REFERENCES sites(id),
    date_reception DATE DEFAULT CURRENT_DATE,
    statut VARCHAR(50) DEFAULT 'en_cours',    -- 'en_cours','valide','litige'
    bon_livraison_numero VARCHAR(100),
    bon_livraison_photo_url VARCHAR(500),
    echantillon_valide BOOLEAN,
    echantillon_valide_par UUID REFERENCES utilisateurs(id),
    non_conformites TEXT,
    reclamation_fournisseur BOOLEAN DEFAULT FALSE,
    detail_reclamation TEXT,
    recu_par UUID REFERENCES utilisateurs(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE receptions_lignes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reception_id UUID REFERENCES receptions(id) ON DELETE CASCADE,
    commande_ligne_id UUID REFERENCES bons_commande_lignes(id),
    article_id UUID REFERENCES articles(id),
    quantite_recue NUMERIC(10,3) NOT NULL,
    quantite_acceptee NUMERIC(10,3) DEFAULT 0,
    quantite_rejetee NUMERIC(10,3) DEFAULT 0,
    motif_rejet TEXT,
    numero_lot VARCHAR(100),
    date_peremption DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SCHÉMA : Module Stocks
-- ============================================================

CREATE TABLE magasins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    nom VARCHAR(200) NOT NULL,
    type VARCHAR(50),                         -- 'central', 'regional', 'point_service'
    site_id UUID REFERENCES sites(id),
    responsable_id UUID REFERENCES utilisateurs(id),
    adresse TEXT,
    actif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE emplacements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    magasin_id UUID REFERENCES magasins(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    zone VARCHAR(50),
    allee VARCHAR(50),
    etagere VARCHAR(50),
    niveau VARCHAR(50),
    actif BOOLEAN DEFAULT TRUE,
    UNIQUE(magasin_id, code)
);

CREATE TABLE stocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID REFERENCES articles(id),
    magasin_id UUID REFERENCES magasins(id),
    emplacement_id UUID REFERENCES emplacements(id),
    quantite NUMERIC(10,3) DEFAULT 0,
    stock_min NUMERIC(10,3) DEFAULT 0,
    stock_max NUMERIC(10,3) DEFAULT 0,
    stock_securite NUMERIC(10,3) DEFAULT 0,
    cump NUMERIC(15,4) DEFAULT 0,            -- Coût Unitaire Moyen Pondéré
    cmm NUMERIC(10,3) DEFAULT 0,             -- Consommation Moyenne Mensuelle
    valeur_totale NUMERIC(15,2) DEFAULT 0,   -- quantite * cump
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(article_id, magasin_id, emplacement_id)
);

CREATE TABLE lots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID REFERENCES articles(id),
    magasin_id UUID REFERENCES magasins(id),
    emplacement_id UUID REFERENCES emplacements(id),
    numero_lot VARCHAR(100) NOT NULL,
    quantite NUMERIC(10,3) DEFAULT 0,
    date_peremption DATE,
    date_reception DATE DEFAULT CURRENT_DATE,
    prix_unitaire NUMERIC(15,2),
    source VARCHAR(50),                       -- 'achat', 'donation'
    statut VARCHAR(50) DEFAULT 'disponible',  -- 'disponible', 'quarantaine', 'expire', 'consomme'
    reception_id UUID REFERENCES receptions(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE mouvements_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type_mouvement VARCHAR(50) NOT NULL,      -- 'entree','sortie','transfert','retour','ajustement','quarantaine','elimination'
    article_id UUID REFERENCES articles(id),
    lot_id UUID REFERENCES lots(id),
    magasin_source_id UUID REFERENCES magasins(id),
    magasin_dest_id UUID REFERENCES magasins(id),
    emplacement_source_id UUID REFERENCES emplacements(id),
    emplacement_dest_id UUID REFERENCES emplacements(id),
    quantite NUMERIC(10,3) NOT NULL,
    prix_unitaire NUMERIC(15,2),
    valeur NUMERIC(15,2),
    reference_document VARCHAR(100),          -- numéro bon, waybill, etc.
    projet_id UUID REFERENCES projets(id),
    destinataire VARCHAR(200),
    motif TEXT,
    justificatif_url VARCHAR(500),
    saisi_par UUID REFERENCES utilisateurs(id),
    valide_par UUID REFERENCES utilisateurs(id),
    date_mouvement TIMESTAMPTZ DEFAULT NOW(),
    synced_offline BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventaires (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero VARCHAR(50) UNIQUE NOT NULL,
    magasin_id UUID REFERENCES magasins(id),
    type_inventaire VARCHAR(50) DEFAULT 'cyclique', -- 'cyclique', 'periodique'
    statut VARCHAR(50) DEFAULT 'en_cours',    -- 'en_cours','valide','annule'
    date_debut TIMESTAMPTZ DEFAULT NOW(),
    date_fin TIMESTAMPTZ,
    cree_par UUID REFERENCES utilisateurs(id),
    valide_par UUID REFERENCES utilisateurs(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventaires_lignes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventaire_id UUID REFERENCES inventaires(id) ON DELETE CASCADE,
    article_id UUID REFERENCES articles(id),
    lot_id UUID REFERENCES lots(id),
    quantite_theorique NUMERIC(10,3) DEFAULT 0,
    quantite_comptee NUMERIC(10,3),
    ecart NUMERIC(10,3),                      -- calculé par trigger
    valeur_ecart NUMERIC(15,2),
    commentaire TEXT,
    compte_par UUID REFERENCES utilisateurs(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE alertes_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type_alerte VARCHAR(50) NOT NULL,         -- 'rupture','stock_min','stock_max','peremption'
    article_id UUID REFERENCES articles(id),
    magasin_id UUID REFERENCES magasins(id),
    lot_id UUID REFERENCES lots(id),
    message TEXT NOT NULL,
    seuil_valeur NUMERIC(10,3),
    valeur_actuelle NUMERIC(10,3),
    statut VARCHAR(20) DEFAULT 'active',      -- 'active', 'acquittee', 'resolue'
    acquittee_par UUID REFERENCES utilisateurs(id),
    date_acquittement TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SCHÉMA : Module Équipements (Assets)
-- ============================================================

CREATE TABLE categories_equipement (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    libelle VARCHAR(100) NOT NULL,
    type_equipement VARCHAR(50),              -- 'informatique', 'mobilier', 'medical', 'vehicule', 'groupe_electrogene'
    duree_amortissement_ans INT DEFAULT 5,
    taux_amortissement NUMERIC(5,2)
);

CREATE TABLE equipements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code_etiquette VARCHAR(50) UNIQUE NOT NULL, -- code barre généré
    code_serie VARCHAR(100),
    designation VARCHAR(200) NOT NULL,
    categorie_id UUID REFERENCES categories_equipement(id),
    marque VARCHAR(100),
    modele VARCHAR(100),
    annee_fabrication INT,
    valeur_achat NUMERIC(15,2),
    devise_id UUID REFERENCES devises(id),
    date_acquisition DATE,
    duree_amortissement_ans INT,
    valeur_residuelle NUMERIC(15,2),
    valeur_venale NUMERIC(15,2),
    est_immobilisation BOOLEAN DEFAULT FALSE,
    statut VARCHAR(50) DEFAULT 'en_service',  -- 'en_service','en_panne','sorti','cede'
    etat VARCHAR(50) DEFAULT 'bon',           -- 'bon','moyen','mauvais','hs'
    site_id UUID REFERENCES sites(id),
    magasin_id UUID REFERENCES magasins(id),
    photo_url VARCHAR(500),
    code_barre_url VARCHAR(500),
    facture_url VARCHAR(500),
    reception_id UUID REFERENCES receptions(id),
    created_by UUID REFERENCES utilisateurs(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE equipements_affectations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipement_id UUID REFERENCES equipements(id) ON DELETE CASCADE,
    utilisateur_id UUID REFERENCES utilisateurs(id),
    site_id UUID REFERENCES sites(id),
    localisation_physique VARCHAR(200),
    date_affectation DATE NOT NULL,
    date_retour DATE,
    statut VARCHAR(20) DEFAULT 'actif',       -- 'actif', 'retourne'
    fiche_affectation_url VARCHAR(500),
    affecter_par UUID REFERENCES utilisateurs(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE equipements_sorties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipement_id UUID REFERENCES equipements(id),
    type_sortie VARCHAR(50) NOT NULL,         -- 'cession','donation','destruction','vente','vol','perte'
    date_sortie DATE NOT NULL,
    valeur_cession NUMERIC(15,2),
    beneficiaire VARCHAR(200),
    motif TEXT,
    pv_url VARCHAR(500),
    bordereau_url VARCHAR(500),
    rapport_police_url VARCHAR(500),          -- pour vol
    texte_plainte TEXT,
    valide_par UUID REFERENCES utilisateurs(id),
    created_by UUID REFERENCES utilisateurs(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SCHÉMA : Module Flotte Motorisée
-- ============================================================

CREATE TABLE vehicules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipement_id UUID REFERENCES equipements(id) UNIQUE,
    immatriculation VARCHAR(50) UNIQUE NOT NULL,
    type_vehicule VARCHAR(50),               -- 'voiture','moto','camion','groupe_electrogene'
    marque VARCHAR(100),
    modele VARCHAR(100),
    annee INT,
    couleur VARCHAR(50),
    kilometrage_initial INT DEFAULT 0,
    kilometrage_actuel INT DEFAULT 0,
    capacite_reservoir_litres NUMERIC(8,2),
    type_carburant VARCHAR(50),              -- 'essence','diesel','electrique'
    -- documents administratifs
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vehicules_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicule_id UUID REFERENCES vehicules(id) ON DELETE CASCADE,
    type_document VARCHAR(100),
    nom_fichier VARCHAR(255),
    chemin_fichier VARCHAR(500),
    date_expiration DATE,
    uploaded_by UUID REFERENCES utilisateurs(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conducteurs_autorises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    utilisateur_id UUID REFERENCES utilisateurs(id),
    numero_permis VARCHAR(100) NOT NULL,
    categorie_permis VARCHAR(20),
    date_expiration_permis DATE,
    permis_scan_url VARCHAR(500),
    actif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE missions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero VARCHAR(50) UNIQUE NOT NULL,
    vehicule_id UUID REFERENCES vehicules(id),
    conducteur_id UUID REFERENCES conducteurs_autorises(id),
    site_depart_id UUID REFERENCES sites(id),
    destination TEXT NOT NULL,
    date_depart TIMESTAMPTZ NOT NULL,
    date_retour_prevue TIMESTAMPTZ,
    date_retour_reelle TIMESTAMPTZ,
    km_depart INT,
    km_retour INT,
    km_parcourus INT GENERATED ALWAYS AS (COALESCE(km_retour, 0) - COALESCE(km_depart, 0)) STORED,
    objectif TEXT,
    statut VARCHAR(20) DEFAULT 'planifiee',  -- 'planifiee','en_cours','terminee','annulee'
    passagers TEXT,
    created_by UUID REFERENCES utilisateurs(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE fiches_suivi_journalier (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicule_id UUID REFERENCES vehicules(id),
    date_fiche DATE NOT NULL,
    mission_id UUID REFERENCES missions(id),
    etat_general VARCHAR(20),               -- 'bon','moyen','mauvais'
    -- checklist
    niveaux_huile BOOLEAN,
    niveaux_eau BOOLEAN,
    pression_pneus BOOLEAN,
    freins_ok BOOLEAN,
    eclairage_ok BOOLEAN,
    essuie_glaces_ok BOOLEAN,
    carrosserie_ok BOOLEAN,
    km_debut INT,
    km_fin INT,
    carburant_debut_litres NUMERIC(8,2),
    carburant_ajoute_litres NUMERIC(8,2),
    carburant_fin_litres NUMERIC(8,2),
    anomalies TEXT,
    rempli_par UUID REFERENCES utilisateurs(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE approvisionnements_carburant (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicule_id UUID REFERENCES vehicules(id),
    date_approvisionnement DATE DEFAULT CURRENT_DATE,
    quantite_litres NUMERIC(8,2) NOT NULL,
    prix_unitaire NUMERIC(10,2),
    montant_total NUMERIC(15,2),
    fournisseur_carburant VARCHAR(100),
    bon_carburant_numero VARCHAR(100),
    km_compteur INT,
    mission_id UUID REFERENCES missions(id),
    saisi_par UUID REFERENCES utilisateurs(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE maintenances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicule_id UUID REFERENCES vehicules(id),
    type_service VARCHAR(10),               -- 'A', 'B', 'C'
    type_maintenance VARCHAR(50),           -- 'preventive', 'corrective'
    description TEXT NOT NULL,
    date_realisation DATE NOT NULL,
    km_compteur INT,
    garage_nom VARCHAR(200),
    montant NUMERIC(15,2),
    prochaine_maintenance_km INT,
    prochaine_maintenance_date DATE,
    facture_url VARCHAR(500),
    realise_par UUID REFERENCES utilisateurs(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE incidents_vehicule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicule_id UUID REFERENCES vehicules(id),
    type_incident VARCHAR(50),              -- 'accident','vol','panne','infraction'
    date_incident DATE NOT NULL,
    lieu TEXT,
    description TEXT NOT NULL,
    conducteur_id UUID REFERENCES conducteurs_autorises(id),
    blessures BOOLEAN DEFAULT FALSE,
    degats_materiels BOOLEAN DEFAULT FALSE,
    estimation_degats NUMERIC(15,2),
    rapport_police_numero VARCHAR(100),
    rapport_police_url VARCHAR(500),
    statut VARCHAR(50) DEFAULT 'ouvert',    -- 'ouvert','en_traitement','clos'
    resolu_le TIMESTAMPTZ,
    note_resolution TEXT,
    saisi_par UUID REFERENCES utilisateurs(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRIGGERS & FONCTIONS
-- ============================================================

-- Trigger : Mise à jour du CUMP après chaque mouvement d'entrée
CREATE OR REPLACE FUNCTION calculer_cump()
RETURNS TRIGGER AS $$
DECLARE
    v_stock_actuel NUMERIC;
    v_valeur_actuelle NUMERIC;
    v_nouveau_cump NUMERIC;
BEGIN
    IF NEW.type_mouvement IN ('entree', 'reception') THEN
        -- Obtenir stock et valeur actuels
        SELECT quantite, valeur_totale INTO v_stock_actuel, v_valeur_actuelle
        FROM stocks
        WHERE article_id = NEW.article_id AND magasin_id = NEW.magasin_dest_id;

        IF v_stock_actuel IS NULL THEN v_stock_actuel := 0; END IF;
        IF v_valeur_actuelle IS NULL THEN v_valeur_actuelle := 0; END IF;

        -- CUMP = (valeur actuelle + nouvelle valeur) / (stock actuel + nouvelle quantité)
        IF (v_stock_actuel + NEW.quantite) > 0 THEN
            v_nouveau_cump := (v_valeur_actuelle + (NEW.quantite * NEW.prix_unitaire)) /
                              (v_stock_actuel + NEW.quantite);
        ELSE
            v_nouveau_cump := NEW.prix_unitaire;
        END IF;

        -- Mise à jour du stock
        INSERT INTO stocks (article_id, magasin_id, quantite, cump, valeur_totale)
        VALUES (NEW.article_id, NEW.magasin_dest_id, NEW.quantite, v_nouveau_cump, NEW.quantite * v_nouveau_cump)
        ON CONFLICT (article_id, magasin_id, emplacement_id)
        DO UPDATE SET
            quantite = stocks.quantite + NEW.quantite,
            cump = v_nouveau_cump,
            valeur_totale = (stocks.quantite + NEW.quantite) * v_nouveau_cump,
            updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cump
AFTER INSERT ON mouvements_stock
FOR EACH ROW EXECUTE FUNCTION calculer_cump();

-- Trigger : Alertes automatiques de stock
CREATE OR REPLACE FUNCTION verifier_alertes_stock()
RETURNS TRIGGER AS $$
BEGIN
    -- Alerte stock minimum
    IF NEW.quantite <= NEW.stock_min AND NEW.stock_min > 0 THEN
        INSERT INTO alertes_stock (type_alerte, article_id, magasin_id, message, seuil_valeur, valeur_actuelle)
        VALUES ('stock_min', NEW.article_id, NEW.magasin_id,
                'Stock minimum atteint', NEW.stock_min, NEW.quantite)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Alerte rupture
    IF NEW.quantite = 0 THEN
        INSERT INTO alertes_stock (type_alerte, article_id, magasin_id, message, seuil_valeur, valeur_actuelle)
        VALUES ('rupture', NEW.article_id, NEW.magasin_id,
                'Rupture de stock', 0, 0)
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_alertes_stock
AFTER UPDATE ON stocks
FOR EACH ROW EXECUTE FUNCTION verifier_alertes_stock();

-- Trigger : Blocage automatique lots périmés
CREATE OR REPLACE FUNCTION bloquer_lots_perimes()
RETURNS void AS $$
BEGIN
    UPDATE lots
    SET statut = 'expire'
    WHERE date_peremption < CURRENT_DATE
    AND statut = 'disponible';

    -- Créer alertes pour lots expirant dans 6 mois
    INSERT INTO alertes_stock (type_alerte, article_id, magasin_id, lot_id, message, valeur_actuelle)
    SELECT 'peremption', l.article_id, l.magasin_id, l.id,
           'Lot expirant dans moins de 6 mois : ' || l.numero_lot,
           l.quantite
    FROM lots l
    WHERE l.date_peremption BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '6 months'
    AND l.statut = 'disponible'
    AND NOT EXISTS (
        SELECT 1 FROM alertes_stock a
        WHERE a.lot_id = l.id AND a.type_alerte = 'peremption' AND a.statut = 'active'
    );
END;
$$ LANGUAGE plpgsql;

-- Trigger : Alertes expiration documents véhicules
CREATE OR REPLACE FUNCTION alertes_documents_vehicule()
RETURNS void AS $$
BEGIN
    -- Carte jaune
    INSERT INTO alertes_stock (type_alerte, message, valeur_actuelle)
    SELECT 'document_vehicule',
           'Carte jaune expire dans moins de 2 mois : ' || v.immatriculation,
           EXTRACT(DAY FROM (v.carte_jaune_expiration - CURRENT_DATE))
    FROM vehicules v
    WHERE v.carte_jaune_expiration BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '2 months'
    AND v.actif = TRUE;

    -- Assurance
    INSERT INTO alertes_stock (type_alerte, message, valeur_actuelle)
    SELECT 'document_vehicule',
           'Assurance expire dans moins de 2 mois : ' || v.immatriculation,
           EXTRACT(DAY FROM (v.assurance_expiration - CURRENT_DATE))
    FROM vehicules v
    WHERE v.assurance_expiration BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '2 months'
    AND v.actif = TRUE;

    -- Visite technique
    INSERT INTO alertes_stock (type_alerte, message, valeur_actuelle)
    SELECT 'document_vehicule',
           'Visite technique expire dans moins de 2 mois : ' || v.immatriculation,
           EXTRACT(DAY FROM (v.visite_technique_expiration - CURRENT_DATE))
    FROM vehicules v
    WHERE v.visite_technique_expiration BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '2 months'
    AND v.actif = TRUE;
END;
$$ LANGUAGE plpgsql;

-- Trigger : Calcul écart inventaire
CREATE OR REPLACE FUNCTION calculer_ecart_inventaire()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.quantite_comptee IS NOT NULL THEN
        NEW.ecart := NEW.quantite_comptee - NEW.quantite_theorique;
        NEW.valeur_ecart := NEW.ecart * (
            SELECT cump FROM stocks
            WHERE article_id = NEW.article_id
            LIMIT 1
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ecart_inventaire
BEFORE UPDATE ON inventaires_lignes
FOR EACH ROW EXECUTE FUNCTION calculer_ecart_inventaire();

-- Trigger : Numérotation automatique
CREATE OR REPLACE FUNCTION generer_numero_document(prefix TEXT, table_name TEXT)
RETURNS TEXT AS $$
DECLARE
    annee TEXT := EXTRACT(YEAR FROM NOW())::TEXT;
    compteur INT;
    numero TEXT;
BEGIN
    EXECUTE format('SELECT COUNT(*) + 1 FROM %I WHERE created_at >= %L',
                   table_name, date_trunc('year', NOW()))
    INTO compteur;
    numero := prefix || '-' || annee || '-' || LPAD(compteur::TEXT, 4, '0');
    RETURN numero;
END;
$$ LANGUAGE plpgsql;

-- Trigger updated_at automatique
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_updated_at_utilisateurs BEFORE UPDATE ON utilisateurs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at_fournisseurs BEFORE UPDATE ON fournisseurs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at_bons_commande BEFORE UPDATE ON bons_commande FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at_stocks BEFORE UPDATE ON stocks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at_lots BEFORE UPDATE ON lots FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at_equipements BEFORE UPDATE ON equipements FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_updated_at_vehicules BEFORE UPDATE ON vehicules FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- INDEX pour performances
-- ============================================================
CREATE INDEX idx_utilisateurs_email ON utilisateurs(email);
CREATE INDEX idx_utilisateurs_role ON utilisateurs(role_id);
CREATE INDEX idx_fournisseurs_categorie ON fournisseurs(categorie_id);
CREATE INDEX idx_fournisseurs_liste_noire ON fournisseurs(liste_noire);
CREATE INDEX idx_articles_categorie ON articles(categorie);
CREATE INDEX idx_demandes_achat_statut ON demandes_achat(statut);
CREATE INDEX idx_demandes_achat_demandeur ON demandes_achat(demandeur_id);
CREATE INDEX idx_bons_commande_statut ON bons_commande(statut);
CREATE INDEX idx_bons_commande_fournisseur ON bons_commande(fournisseur_id);
CREATE INDEX idx_stocks_article_magasin ON stocks(article_id, magasin_id);
CREATE INDEX idx_lots_article ON lots(article_id);
CREATE INDEX idx_lots_peremption ON lots(date_peremption);
CREATE INDEX idx_lots_statut ON lots(statut);
CREATE INDEX idx_mouvements_article ON mouvements_stock(article_id);
CREATE INDEX idx_mouvements_date ON mouvements_stock(date_mouvement);
CREATE INDEX idx_mouvements_magasin ON mouvements_stock(magasin_source_id, magasin_dest_id);
CREATE INDEX idx_equipements_categorie ON equipements(categorie_id);
CREATE INDEX idx_equipements_statut ON equipements(statut);
CREATE INDEX idx_vehicules_immatriculation ON vehicules(immatriculation);
CREATE INDEX idx_alertes_statut ON alertes_stock(statut);
CREATE INDEX idx_alertes_type ON alertes_stock(type_alerte);
CREATE INDEX idx_journaux_utilisateur ON journaux_connexion(utilisateur_id);
CREATE INDEX idx_journaux_date ON journaux_connexion(created_at);

-- ============================================================
-- DONNÉES INITIALES
-- ============================================================

-- Rôles
INSERT INTO roles (code, libelle, permissions) VALUES
('admin', 'Administrateur', '{"*": {"*": true}}'),
('responsable_logistique', 'Responsable Logistique', '{"achats": {"*": true}, "stocks": {"*": true}, "equipements": {"*": true}, "flotte": {"*": true}}'),
('gestionnaire_achats', 'Gestionnaire Achats', '{"achats": {"*": true}}'),
('magasinier', 'Magasinier', '{"stocks": {"lire": true, "creer": true, "modifier": true}}'),
('gestionnaire_equipements', 'Gestionnaire Équipements', '{"equipements": {"*": true}, "flotte": {"*": true}}'),
('validateur', 'Validateur', '{"achats": {"valider": true}, "stocks": {"valider": true}}'),
('utilisateur', 'Utilisateur Standard', '{"*": {"lire": true}}'),
('invite', 'Invité', '{"*": {"lire": true}}');

-- Devise de base
INSERT INTO devises (code, libelle, taux_vers_fcfa, est_devise_base) VALUES
('FCFA', 'Franc CFA', 1, TRUE),
('USD', 'Dollar américain', 600, FALSE),
('EUR', 'Euro', 655.957, FALSE),
('GBP', 'Livre sterling', 760, FALSE),
('CAD', 'Dollar canadien', 440, FALSE);

-- Seuils d'achat
INSERT INTO seuils_achat (libelle, montant_min, montant_max, procedure, nb_devis_requis) VALUES
('Petit achat', 0, 500000, 'devis_unique', 1),
('Achat intermédiaire', 500001, 2000000, 'comparaison_prix', 3),
('Appel d''offres local', 2000001, 10000000, 'ao_local', 5),
('Appel d''offres international', 10000001, NULL, 'ao_international', 5);

-- Admin par défaut (mot de passe: Admin@MSI2026! - à changer impérativement)
INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe_hash, role_id, actif, premiere_connexion)
SELECT 'Admin', 'MSI', 'admin@mariestopes-bf.org',
       '$2b$12$placeholder_hash_change_on_first_run',
       r.id, TRUE, TRUE
FROM roles r WHERE r.code = 'admin';
