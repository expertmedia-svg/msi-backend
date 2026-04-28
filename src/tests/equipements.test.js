// src/tests/equipements.test.js
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
jest.mock('qrcode', () => ({ toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,qrcode') }));

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_minimum_32_chars_for_test_use';

const genToken = (role = 'gestionnaire_equipements') => jwt.sign(
  { userId: 'uuid-test', email: 'test@msi.com', role },
  JWT_SECRET, { expiresIn: '1h' }
);

const mockUser = {
  id: 'uuid-test', nom: 'Test', prenom: 'User',
  email: 'test@msi.com', actif: true, verrouille_jusqu_a: null,
  role_code: 'gestionnaire_equipements',
  permissions: { equipements: { lire: true, creer: true, modifier: true }, flotte: { lire: true, creer: true } }
};

describe('GET /api/equipements', () => {
  it('doit lister les équipements', async () => {
    query
      .mockResolvedValueOnce({ rows: [mockUser] }) // auth
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [
        { id: 'eq-1', code_etiquette: 'MSI-2026-00001', designation: 'Laptop Dell', statut: 'en_service' },
        { id: 'eq-2', code_etiquette: 'MSI-2026-00002', designation: 'Toyota Hilux', statut: 'en_service' },
      ]});

    const res = await request(app)
      .get('/api/equipements')
      .set('Authorization', `Bearer ${genToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });
});

describe('POST /api/equipements', () => {
  it('doit créer un équipement avec QR code', async () => {
    transaction.mockImplementationOnce(async (cb) => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ n: '5' }] })  // count pour code
          .mockResolvedValueOnce({ rows: [{
            id: 'new-eq-id',
            code_etiquette: 'MSI-2026-00006',
            designation: 'MacBook Pro 14"',
            code_barre_url: 'data:image/png;base64,qrcode'
          }]}),
        release: jest.fn()
      };
      return cb(mockClient);
    });

    query.mockResolvedValueOnce({ rows: [mockUser] });

    const res = await request(app)
      .post('/api/equipements')
      .set('Authorization', `Bearer ${genToken()}`)
      .send({
        designation: 'MacBook Pro 14"',
        marque: 'Apple',
        modele: 'MacBook Pro M3',
        valeur_achat: 1500000,
        date_acquisition: '2026-01-15',
        duree_amortissement_ans: 4,
        est_immobilisation: true
      });

    expect(res.status).toBe(201);
    expect(res.body.data.code_etiquette).toMatch(/^MSI-2026-/);
  });
});

describe('GET /api/flotte', () => {
  it('doit lister les véhicules avec alertes documents', async () => {
    query
      .mockResolvedValueOnce({ rows: [mockUser] })
      .mockResolvedValueOnce({ rows: [
        {
          id: 'veh-1',
          immatriculation: '11BF2026A',
          marque: 'Toyota',
          modele: 'Hilux',
          type_vehicule: 'voiture',
          kilometrage_actuel: 45230,
          carburant_mois: '120.5',
          carte_jaune_expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30j
          assurance_expiration: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          visite_technique_expiration: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000),
          alerte_carte_jaune: true,
          alerte_assurance: false,
          alerte_visite_technique: false,
        }
      ]});

    const res = await request(app)
      .get('/api/flotte')
      .set('Authorization', `Bearer ${genToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].alerte_carte_jaune).toBe(true);
  });
});

describe('GET /api/flotte/kpi', () => {
  it('doit retourner les KPIs flotte', async () => {
    query
      .mockResolvedValueOnce({ rows: [mockUser] })
      .mockResolvedValueOnce({ rows: [{
        nb_vehicules: 8,
        missions_en_cours: 2,
        carburant_mois: 850.5,
        cout_carburant_annee: 4200000,
        cout_maintenance_annee: 1800000,
        incidents_ouverts: 1,
        vehicules_avec_alertes_documents: 2
      }]});

    const res = await request(app)
      .get('/api/flotte/kpi')
      .set('Authorization', `Bearer ${genToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.nb_vehicules).toBe(8);
    expect(res.body.data.vehicules_avec_alertes_documents).toBe(2);
  });
});
