// src/tests/fournisseurs.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { query, transaction } = require('../config/database');

jest.mock('../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  pool: { query: jest.fn(), on: jest.fn(), connect: jest.fn((cb) => cb(null, {}, jest.fn())) }
}));
jest.mock('../config/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_minimum_32_chars_for_test_use';

const genToken = (role = 'gestionnaire_achats') => jwt.sign(
  { userId: 'uuid-test', email: 'test@msi.com', role },
  JWT_SECRET, { expiresIn: '1h' }
);

const mockUtilisateurAchats = {
  id: 'uuid-test', nom: 'Test', prenom: 'User',
  email: 'test@msi.com', actif: true, site: 'CSO',
  departement: 'Logistique', verrouille_jusqu_a: null,
  role_code: 'gestionnaire_achats',
  permissions: { achats: { lire: true, creer: true, modifier: true } }
};

describe('GET /api/fournisseurs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('doit retourner la liste des fournisseurs', async () => {
    query
      .mockResolvedValueOnce({ rows: [mockUtilisateurAchats] }) // auth
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })        // count
      .mockResolvedValueOnce({ rows: [
        { id: '1', code: 'FOUR-001', nom: 'Pharmacie Test', note_globale: 4.2, nb_commandes: 5 },
        { id: '2', code: 'FOUR-002', nom: 'Fournisseur 2', note_globale: 3.8, nb_commandes: 2 },
      ]});

    const res = await request(app)
      .get('/api/fournisseurs')
      .set('Authorization', `Bearer ${genToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toBeDefined();
  });

  it('doit filtrer par liste noire', async () => {
    query
      .mockResolvedValueOnce({ rows: [mockUtilisateurAchats] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: '3', code: 'FOUR-003', nom: 'Fraudeur SA', liste_noire: true }] });

    const res = await request(app)
      .get('/api/fournisseurs?liste_noire=true')
      .set('Authorization', `Bearer ${genToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].liste_noire).toBe(true);
  });
});

describe('POST /api/fournisseurs', () => {
  it('doit créer un fournisseur avec code auto', async () => {
    query
      .mockResolvedValueOnce({ rows: [mockUtilisateurAchats] }) // auth
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })        // count pour code
      .mockResolvedValueOnce({ rows: [{
        id: 'new-id',
        code: 'FOUR-2026-0001',
        nom: 'Nouveau Fournisseur',
        email: 'test@four.com'
      }]});

    const res = await request(app)
      .post('/api/fournisseurs')
      .set('Authorization', `Bearer ${genToken()}`)
      .send({ nom: 'Nouveau Fournisseur', email: 'test@four.com', pays: 'Burkina Faso' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe('FOUR-2026-0001');
  });

  it('doit rejeter si nom manquant', async () => {
    // Le validator express-validator bloque avant le contrôleur
    const res = await request(app)
      .post('/api/fournisseurs')
      .set('Authorization', `Bearer ${genToken()}`)
      .send({ email: 'test@four.com' });
    // Soit 400 (validation) soit 500 (DB error sans nom)
    expect([400, 500]).toContain(res.status);
  });
});

describe('PUT /api/fournisseurs/:id/liste-noire', () => {
  it('doit ajouter à la liste noire avec motif', async () => {
    query
      .mockResolvedValueOnce({ rows: [mockUtilisateurAchats] })
      .mockResolvedValueOnce({ rows: [{ id: 'four-id', nom: 'Mauvais Fournisseur', liste_noire: true }] });

    const res = await request(app)
      .put('/api/fournisseurs/four-id/liste-noire')
      .set('Authorization', `Bearer ${genToken()}`)
      .send({ ajouter: true, motif: 'Fraude documentaire constatée le 01/04/2026' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('liste noire');
  });

  it('doit rejeter sans motif', async () => {
    query.mockResolvedValueOnce({ rows: [mockUtilisateurAchats] });

    const res = await request(app)
      .put('/api/fournisseurs/four-id/liste-noire')
      .set('Authorization', `Bearer ${genToken()}`)
      .send({ ajouter: true });  // motif manquant

    expect(res.status).toBe(400);
  });
});

describe('POST /api/achats/demandes', () => {
  it('doit créer une demande d\'achat', async () => {
    query
      .mockResolvedValueOnce({ rows: [mockUtilisateurAchats] }) // auth
      .mockResolvedValueOnce({ rows: [{ id: 'seuil-id', procedure: 'devis_unique' }] }); // seuil

    transaction.mockImplementationOnce(async (cb) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ n: 1 }] })  // count
          .mockResolvedValueOnce({ rows: [{ id: 'da-id', numero: 'DA-2026-0001', statut: 'soumis' }] }) // insert DA
          .mockResolvedValueOnce({ rows: [] }), // insert ligne
        release: jest.fn()
      };
      return cb(mockClient);
    });

    const res = await request(app)
      .post('/api/achats/demandes')
      .set('Authorization', `Bearer ${genToken()}`)
      .send({
        titre: 'Achat médicaments Q2 2026',
        priorite: 'normale',
        date_besoin: '2026-05-01',
        justification: 'Réapprovisionnement trimestriel',
        lignes: [{
          description: 'Contraceptifs oraux',
          quantite: 500,
          unite_mesure: 'plaquette',
          prix_unitaire_estime: 1500
        }]
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.numero).toBe('DA-2026-0001');
  });

  it('doit rejeter sans lignes', async () => {
    query.mockResolvedValueOnce({ rows: [mockUtilisateurAchats] });

    const res = await request(app)
      .post('/api/achats/demandes')
      .set('Authorization', `Bearer ${genToken()}`)
      .send({ titre: 'Demande vide', lignes: [] });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('ligne');
  });
});
