// src/tests/auth.test.js
const request = require('supertest');
const app = require('../server');
const { query } = require('../config/database');

// Mock de la base de données
jest.mock('../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  pool: { query: jest.fn(), on: jest.fn(), connect: jest.fn((cb) => cb(null, {}, jest.fn())) }
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn()
}));

jest.mock('../services/emailService', () => ({
  envoyerEmail: jest.fn().mockResolvedValue(true)
}));

describe('POST /api/auth/connexion', () => {
  beforeEach(() => jest.clearAllMocks());

  it('doit rejeter une requête sans email', async () => {
    const res = await request(app)
      .post('/api/auth/connexion')
      .send({ mot_de_passe: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('doit retourner 401 si utilisateur introuvable', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/auth/connexion')
      .send({ email: 'inconnu@test.com', mot_de_passe: 'test123' });
    expect(res.status).toBe(401);
  });

  it('doit retourner 403 si compte désactivé', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'uuid-test', email: 'test@msi.com', actif: false,
        mot_de_passe_hash: '$2b$12$hash', tentatives_echec: 0,
        role_code: 'utilisateur', permissions: {}
      }]
    });
    const res = await request(app)
      .post('/api/auth/connexion')
      .send({ email: 'test@msi.com', mot_de_passe: 'test123' });
    expect(res.status).toBe(403);
  });
});

describe('GET /health', () => {
  it('doit retourner ok', async () => {
    const { pool } = require('../config/database');
    pool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Routes protégées', () => {
  it('doit rejeter sans token JWT', async () => {
    const res = await request(app).get('/api/fournisseurs');
    expect(res.status).toBe(401);
  });

  it('doit rejeter un token invalide', async () => {
    const res = await request(app)
      .get('/api/fournisseurs')
      .set('Authorization', 'Bearer token_invalide');
    expect(res.status).toBe(401);
  });
});
