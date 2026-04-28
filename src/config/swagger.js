// src/config/swagger.js
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MSI Burkina Faso - API Gestion Logistique',
      version: '1.0.0',
      description: `
## API REST – Système de Gestion Logistique MSI BF

Modules couverts :
- **Authentification** : JWT, gestion mots de passe, verrouillage
- **Achats** : Demandes, devis, commandes, réceptions
- **Stocks** : Mouvements, CUMP, CMM, alertes, inventaires
- **Équipements** : Assets, affectations, amortissements
- **Flotte** : Véhicules, missions, carburant, maintenance
- **Rapports** : Export Excel/PDF

**Authentification** : Bearer JWT dans le header \`Authorization\`
      `,
      contact: { name: 'MSI BF Informatique', email: 'it@mariestopes-bf.org' }
    },
    servers: [
      { url: '/api', description: 'Serveur principal' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      },
      schemas: {
        Erreur: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            limite: { type: 'integer' },
            pages: { type: 'integer' }
          }
        }
      }
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentification et gestion des sessions' },
      { name: 'Fournisseurs', description: 'Gestion des fournisseurs' },
      { name: 'Achats', description: 'Cycle d\'achat complet' },
      { name: 'Stocks', description: 'Gestion des stocks et inventaires' },
      { name: 'Équipements', description: 'Gestion des assets' },
      { name: 'Flotte', description: 'Gestion de la flotte motorisée' },
      { name: 'Rapports', description: 'Exports Excel et PDF' },
      { name: 'Admin', description: 'Administration système' },
      { name: 'Référentiel', description: 'Données de référence' }
    ]
  },
  apis: ['./src/routes/*.js', './src/controllers/*.js']
};

module.exports = swaggerJsdoc(options);
