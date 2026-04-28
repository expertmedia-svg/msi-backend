// src/tests/stocks.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { query } = require('../config/database');

jest.mock('../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  pool: { query: jest.fn(), on: jest.fn(), connect: jest.fn((cb) => cb(null, {}, jest.fn())) }
}));
jest.mock('../config/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

const genToken = (role = 'magasinier') => jwt.sign(
  { userId: 'uuid-test', email: 'test@msi.com', role },
  process.env.JWT_SECRET || 'test_secret_key_minimum_32_chars_for_test',
  { expiresIn: '1h' }
);

const mockUtilisateur = {
  id: 'uuid-test', nom: 'Test', prenom: 'User', email: 'test@msi.com',
  role_id: 'role-id', actif: true, site: 'CSO',
  departement: 'Logistique', verrouille_jusqu_a: null,
  role_code: 'magasinier',
  permissions: { stocks: { lire: true, creer: true, modifier: true } }
};

describe('GET /api/stocks/kpi', () => {
  it('doit retourner les KPIs stocks', async () => {
    query
      .mockResolvedValueOnce({ rows: [mockUtilisateur] }) // auth middleware
      .mockResolvedValueOnce({ rows: [{
        valeur_totale_stock: 5000000, nb_references: 45,
        nb_magasins: 3, nb_ruptures: 2, nb_stock_min: 5,
        nb_alertes_actives: 7, nb_lots_proches_peremption: 3, nb_lots_expires: 1
      }] });

    const res = await request(app)
      .get('/api/stocks/kpi')
      .set('Authorization', `Bearer ${genToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('nb_ruptures');
  });
});

describe('POST /api/stocks/mouvements', () => {
  it('doit rejeter une quantité négative', async () => {
    query.mockResolvedValueOnce({ rows: [mockUtilisateur] });

    const res = await request(app)
      .post('/api/stocks/mouvements')
      .set('Authorization', `Bearer ${genToken()}`)
      .send({
        type_mouvement: 'entree',
        article_id: 'art-id',
        magasin_dest_id: 'mag-id',
        quantite: -5,
        prix_unitaire: 1000
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('doit réussir une entrée valide', async () => {
    const mockClient = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'lot-id' }] }) // insert lot
        .mockResolvedValueOnce({ rows: [] }) // update stocks
        .mockResolvedValueOnce({ rows: [{ id: 'mv-id', type_mouvement: 'entree' }] }) // insert mouvement
        .mockResolvedValueOnce({ rows: [] }), // update stocks entree
      release: jest.fn()
    };

    query.mockResolvedValueOnce({ rows: [mockUtilisateur] }); // auth

    const { transaction } = require('../config/database');
    transaction.mockImplementationOnce(async (cb) => cb(mockClient));

    const res = await request(app)
      .post('/api/stocks/mouvements')
      .set('Authorization', `Bearer ${genToken()}`)
      .send({
        type_mouvement: 'entree',
        article_id: 'art-id',
        magasin_dest_id: 'mag-id',
        quantite: 100,
        prix_unitaire: 500,
        numero_lot: 'LOT-2026-001',
        date_peremption: '2028-12-31'
      });

    expect(res.status).toBe(201);
  });
});
