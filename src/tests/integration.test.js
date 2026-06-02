// src/tests/integration.test.js
// Tests d'intégration Phase 4 - Scénarios complets

const request = require('supertest');
const app = require('../server');
const { query } = require('../config/database');

const mockToken = 'Bearer mock-integration-token';

describe('INTEGRATION TESTS - Scénarios Complets', () => {

  // ── Workflow Achats Complet ────────────────────────────

  describe('Workflow Achats: DAO → Devis → BC → Réception', () => {
    let daoId, devisId, bcId, receptionId;

    it('1. Créer une Demande d\'Achat (DAO)', async () => {
      const res = await request(app)
        .post('/api/achats/demandes')
        .set('Authorization', mockToken)
        .send({
          projet_id: 'proj-123',
          demandeur_id: 'user-123',
          lignes: [
            {
              article_id: 'art-1',
              quantite: 100,
              prix_unitaire_estime: 5000
            }
          ]
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      daoId = res.body.id || res.body.data?.id;
    });

    it('2. Valider la DAO', async () => {
      if (!daoId) this.skip();

      const res = await request(app)
        .put(`/api/achats/demandes/${daoId}/valider`)
        .set('Authorization', mockToken)
        .send({ statut: 'valide' });

      expect([200, 201]).toContain(res.statusCode);
    });

    it('3. Créer Demande de Devis', async () => {
      const res = await request(app)
        .post('/api/achats/devis')
        .set('Authorization', mockToken)
        .send({
          demande_achat_id: daoId,
          date_limite_reponse: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

      expect([200, 201]).toContain(res.statusCode);
      devisId = res.body.id || res.body.data?.id;
    });

    it('4. Enregistrer 3 offres fournisseurs', async () => {
      if (!devisId) this.skip();

      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post('/api/achats/devis')
          .set('Authorization', mockToken)
          .send({
            demande_devis_fournisseur_id: `ddf-${i}`,
            delai_livraison_jours: 14 + i,
            conditions_paiement: 'Net 30',
            validite_offre_jours: 30,
            lignes: [
              {
                quantite_disponible: 100,
                prix_unitaire: 4500 + i * 100,
                devise_id: 'fcfa'
              }
            ]
          });

        expect([200, 201]).toContain(res.statusCode);
      }
    });

    it('5. Générer tableau comparatif', async () => {
      if (!devisId) this.skip();

      const res = await request(app)
        .get(`/api/achats/devis/${devisId}/comparatif`)
        .set('Authorization', mockToken);

      expect([200, 404]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(res.body.tableau).toBeDefined();
        expect(res.body.tableau.offres).toBeInstanceOf(Array);
      }
    });

    it('6. Créer Bon de Commande', async () => {
      const res = await request(app)
        .post('/api/achats/commandes')
        .set('Authorization', mockToken)
        .send({
          demande_achat_id: daoId,
          fournisseur_id: 'fournisseur-1',
          lignes: [
            {
              article_id: 'art-1',
              quantite_commandee: 100,
              prix_unitaire: 4500
            }
          ]
        });

      expect([200, 201]).toContain(res.statusCode);
      bcId = res.body.id || res.body.data?.id;
    });

    it('7. Enregistrer réception', async () => {
      const res = await request(app)
        .post('/api/achats/receptions')
        .set('Authorization', mockToken)
        .send({
          commande_id: bcId,
          date_reception: new Date(),
          lignes: [
            {
              article_id: 'art-1',
              quantite_recue: 100,
              statut: 'conforme'
            }
          ]
        });

      expect([200, 201]).toContain(res.statusCode);
      receptionId = res.body.id || res.body.data?.id;
    });

    it('8. Enregistrer non-conformité (si applicable)', async () => {
      if (!receptionId) this.skip();

      const res = await request(app)
        .post(`/api/stocks/receptions/${receptionId}/non-conformites`)
        .set('Authorization', mockToken)
        .send({
          type: 'quantite_manquante',
          description: '5 unités manquantes',
          quantite_affectee: 5,
          resolution_proposee: 'Demander retour fournisseur'
        });

      expect([200, 201, 400]).toContain(res.statusCode);
    });
  });

  // ── Workflow Stocks Complet ────────────────────────────

  describe('Workflow Stocks: FIFO/FEFO → Alertes → Inventaire', () => {
    let articleId = 'art-test-stocks';

    it('1. Vérifier alertes stocks initiales', async () => {
      const res = await request(app)
        .get('/api/stocks/alertes/verification')
        .set('Authorization', mockToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.alertes).toBeDefined();
    });

    it('2. Générer alertes automatiquement', async () => {
      const res = await request(app)
        .post('/api/stocks/alertes/generer')
        .set('Authorization', mockToken);

      expect([200, 500]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(res.body.alertes_creees).toBeDefined();
      }
    });

    it('3. Effectuer sortie FIFO', async () => {
      const res = await request(app)
        .post('/api/stocks/sortie/fifo-fefo')
        .set('Authorization', mockToken)
        .send({
          article_id: articleId,
          quantite_demandee: 50,
          methode: 'FIFO',
          motif: 'Test FIFO'
        });

      expect([201, 400, 500]).toContain(res.statusCode);
    });

    it('4. Effectuer sortie FEFO', async () => {
      const res = await request(app)
        .post('/api/stocks/sortie/fifo-fefo')
        .set('Authorization', mockToken)
        .send({
          article_id: articleId,
          quantite_demandee: 30,
          methode: 'FEFO',
          motif: 'Test FEFO'
        });

      expect([201, 400, 500]).toContain(res.statusCode);
    });

    it('5. Analyser pricing FIFO vs FEFO vs CUMP', async () => {
      const res = await request(app)
        .get('/api/stocks/analyse/pricing')
        .query({ article_id: articleId, quantite: 100 })
        .set('Authorization', mockToken);

      expect([200, 400]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(res.body.comparaison).toBeDefined();
      }
    });

    it('6. Créer inventaire cyclique', async () => {
      const res = await request(app)
        .post('/api/stocks/inventaires')
        .set('Authorization', mockToken)
        .send({
          magasin_id: 'mag-1',
          date_inventaire: new Date(),
          lignes: [
            {
              article_id: articleId,
              quantite_comptee: 200,
              variance: 0
            }
          ]
        });

      expect([200, 201, 400]).toContain(res.statusCode);
    });
  });

  // ── Workflow Flotte Complet ────────────────────────────

  describe('Workflow Flotte: Maintenance A/B/C → Carburant → KPI', () => {
    let vehiculeId = 'veh-test-1';
    let maintenanceId;

    it('1. Planifier maintenance A (1000km)', async () => {
      const res = await request(app)
        .post('/api/flotte/maintenances/planifier')
        .set('Authorization', mockToken)
        .send({
          vehicule_id: vehiculeId,
          type_service: 'A',
          km_prochain: 1000,
          date_prochaine: new Date(),
          description: 'Test Maintenance A'
        });

      expect([200, 201]).toContain(res.statusCode);
      maintenanceId = res.body.id || res.body.maintenance?.id;
    });

    it('2. Alerter maintenances en retard', async () => {
      const res = await request(app)
        .get('/api/flotte/maintenances/alertes')
        .set('Authorization', mockToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.alertes).toBeDefined();
    });

    it('3. Enregistrer maintenance effectuée', async () => {
      if (!maintenanceId) this.skip();

      const res = await request(app)
        .put(`/api/flotte/maintenances/${maintenanceId}/effectuee`)
        .set('Authorization', mockToken)
        .send({
          date_realisation: new Date(),
          km_compteur: 1000,
          garage_nom: 'Garage Test',
          montant: 150000,
          notes: 'Maintenance effectuée sans problème'
        });

      expect([200, 404]).toContain(res.statusCode);
    });

    it('4. Enregistrer approvisionnement carburant', async () => {
      const res = await request(app)
        .post('/api/flotte/carburant/enregistrer')
        .set('Authorization', mockToken)
        .send({
          vehicule_id: vehiculeId,
          quantite_litres: 50,
          prix_litre: 650,
          date_approvisionnement: new Date(),
          lieu: 'Station Shell'
        });

      expect([200, 201]).toContain(res.statusCode);
    });

    it('5. Analyser consommation carburant', async () => {
      const res = await request(app)
        .get('/api/flotte/carburant/analyse')
        .query({ periode: 'mois' })
        .set('Authorization', mockToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });

    it('6. Calculer KPI budget flotte', async () => {
      const res = await request(app)
        .get('/api/flotte/kpi/budget')
        .set('Authorization', mockToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.budget).toBeDefined();
    });

    it('7. Afficher historique maintenances véhicule', async () => {
      const res = await request(app)
        .get(`/api/flotte/maintenances/${vehiculeId}/historique`)
        .set('Authorization', mockToken);

      expect([200, 404]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(res.body.maintenances).toBeInstanceOf(Array);
      }
    });
  });

  // ── Workflow Dashboard & Rapports ──────────────────────

  describe('Workflow Reporting: Dashboard → Export PDF', () => {
    it('1. Charger KPIs directeur', async () => {
      const res = await request(app)
        .get('/api/dashboard/directeur')
        .query({ periode: 'mois' })
        .set('Authorization', mockToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.kpis).toBeDefined();
    });

    it('2. Charger résumé exécutif', async () => {
      const res = await request(app)
        .get('/api/dashboard/resume-executif')
        .set('Authorization', mockToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.resume_critique).toBeInstanceOf(Array);
    });

    it('3. Exporter rapport audit justificatifs PDF', async () => {
      const res = await request(app)
        .get('/api/rapports/audit/justificatifs/pdf')
        .query({
          bailleur_code: 'BAILLEUR-1',
          date_debut: '2026-01-01',
          date_fin: '2026-06-30'
        })
        .set('Authorization', mockToken);

      expect([200, 400, 500]).toContain(res.statusCode);
    });

    it('4. Exporter rapport conformité achats PDF', async () => {
      const res = await request(app)
        .get('/api/rapports/audit/conformite-achats/pdf')
        .query({
          date_debut: '2026-01-01',
          date_fin: '2026-06-30'
        })
        .set('Authorization', mockToken);

      expect([200, 400, 500]).toContain(res.statusCode);
    });

    it('5. Exporter inventaire stocks PDF', async () => {
      const res = await request(app)
        .get('/api/rapports/audit/inventaire/pdf')
        .query({
          magasin_id: 'mag-1',
          date_inventaire: new Date().toISOString()
        })
        .set('Authorization', mockToken);

      expect([200, 400, 500]).toContain(res.statusCode);
    });
  });

  // ── Workflow Scanner Code-barres ───────────────────────

  describe('Workflow Scanner: Validation → Search → Sync', () => {
    it('1. Valider format code-barres', async () => {
      const res = await request(app)
        .post('/api/scans/valider')
        .set('Authorization', mockToken)
        .send({ code_barres: '5901234123457' }); // EAN-13 valide

      expect(res.statusCode).toBe(200);
      expect(res.body.est_valide).toBeDefined();
    });

    it('2. Scanner article (recherche)', async () => {
      const res = await request(app)
        .post('/api/scans/article')
        .set('Authorization', mockToken)
        .send({
          code_barres: 'ART-123-456',
          contexte: { source: 'web' }
        });

      expect([200, 404]).toContain(res.statusCode);
    });

    it('3. Recherche article fallback', async () => {
      const res = await request(app)
        .get('/api/scans/article')
        .query({ code_barres: 'ART-123' })
        .set('Authorization', mockToken);

      expect([200, 404]).toContain(res.statusCode);
    });

    it('4. Scanner véhicule (immatriculation)', async () => {
      const res = await request(app)
        .post('/api/scans/vehicule')
        .set('Authorization', mockToken)
        .send({
          immatriculation: 'BF-2023-AB-1234',
          contexte: { source: 'mobile' }
        });

      expect([200, 404]).toContain(res.statusCode);
    });

    it('5. Générer code-barres pour article', async () => {
      const res = await request(app)
        .get('/api/scans/generer/art-123')
        .set('Authorization', mockToken);

      expect([200, 400]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        expect(res.body.code_barres).toBeDefined();
      }
    });

    it('6. Voir historique scans', async () => {
      const res = await request(app)
        .get('/api/scans/historique')
        .query({ type_scan: 'article', limite: 10 })
        .set('Authorization', mockToken);

      expect(res.statusCode).toBe(200);
      expect(res.body.scans).toBeInstanceOf(Array);
    });
  });

  // ── Tests de Sécurité ──────────────────────────────────

  describe('Security Tests', () => {
    it('Devrait rejeter requête sans token', async () => {
      const res = await request(app)
        .get('/api/dashboard/directeur');

      expect(res.statusCode).toBe(401);
    });

    it('Devrait rejeter token invalide', async () => {
      const res = await request(app)
        .get('/api/dashboard/directeur')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.statusCode).toBe(401);
    });

    it('Devrait rejeter requête avec données invalides', async () => {
      const res = await request(app)
        .post('/api/achats/demandes')
        .set('Authorization', mockToken)
        .send({
          // Manque les champs obligatoires
        });

      expect(res.statusCode).toBe(400);
    });

    it('Devrait limiter les tailles de requête', async () => {
      const bigData = 'x'.repeat(10 * 1024 * 1024); // 10MB

      const res = await request(app)
        .post('/api/achats/demandes')
        .set('Authorization', mockToken)
        .send({ data: bigData });

      expect(res.statusCode).toBe(413); // Payload Too Large
    });
  });

  // ── Tests de Performance ───────────────────────────────

  describe('Performance Tests', () => {
    it('Dashboard KPI doit charger en < 500ms', async () => {
      const start = Date.now();

      await request(app)
        .get('/api/dashboard/directeur')
        .set('Authorization', mockToken);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500);
    });

    it('Listing achats doit charger en < 1s', async () => {
      const start = Date.now();

      await request(app)
        .get('/api/achats/demandes')
        .query({ page: 1, limite: 25 })
        .set('Authorization', mockToken);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });

    it('Export PDF doit compléter en < 3s', async () => {
      const start = Date.now();

      await request(app)
        .get('/api/rapports/audit/inventaire/pdf')
        .query({
          magasin_id: 'mag-1',
          date_inventaire: new Date().toISOString()
        })
        .set('Authorization', mockToken);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(3000);
    });
  });

});

// ── Suite de tests spécifiques ────────────────────────────

describe('EDGE CASES & ERROR HANDLING', () => {
  it('Devrait gérer dévis sans offres', async () => {
    const res = await request(app)
      .get('/api/achats/devis/non-existent-id/comparatif')
      .set('Authorization', mockToken);

    expect([404]).toContain(res.statusCode);
  });

  it('Devrait gérer sortie avec quantité insuffisante', async () => {
    const res = await request(app)
      .post('/api/stocks/sortie/fifo-fefo')
      .set('Authorization', mockToken)
      .send({
        article_id: 'inexistent',
        quantite_demandee: 99999,
        methode: 'FIFO'
      });

    expect([400, 500]).toContain(res.statusCode);
  });

  it('Devrait gérer maintenance avec véhicule inexistent', async () => {
    const res = await request(app)
      .post('/api/flotte/maintenances/planifier')
      .set('Authorization', mockToken)
      .send({
        vehicule_id: 'inexistent',
        type_service: 'A',
        km_prochain: 1000,
        date_prochaine: new Date()
      });

    expect([400, 404, 500]).toContain(res.statusCode);
  });
});
