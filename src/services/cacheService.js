// src/services/cacheService.js
// Service de caching avec Redis pour optimisation performance

const redis = require('redis');
const logger = require('../config/logger');

class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.init();
  }

  async init() {
    try {
      this.client = redis.createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        db: process.env.REDIS_DB || 0,
        retryStrategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.warn('Redis connection refused - will operate without cache');
            return;
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Retry time exhausted');
          }
          return Math.min(options.attempt * 100, 3000);
        },
      });

      this.client.on('error', (err) => {
        logger.error('Redis error:', err);
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info('✅ Redis connected');
      });

      await new Promise((resolve, reject) => {
        this.client.on('ready', resolve);
        this.client.on('error', reject);
        setTimeout(() => {
          if (!this.isConnected) {
            logger.warn('⚠️ Redis not available - operating without cache');
            resolve();
          }
        }, 2000);
      });
    } catch (error) {
      logger.warn('Redis initialization skipped - operating without cache:', error.message);
      this.isConnected = false;
    }
  }

  // ── Getter générique ───────────────────────────────────

  async get(key) {
    if (!this.isConnected || !this.client) return null;

    try {
      const value = await this.client.getAsync(key);
      if (value) {
        logger.debug(`Cache HIT: ${key}`);
        return JSON.parse(value);
      }
      logger.debug(`Cache MISS: ${key}`);
      return null;
    } catch (error) {
      logger.error(`Cache get error (${key}):`, error);
      return null;
    }
  }

  // ── Setter générique ───────────────────────────────────

  async set(key, value, ttl = 3600) {
    if (!this.isConnected || !this.client) return false;

    try {
      const stringValue = JSON.stringify(value);
      await this.client.setexAsync(key, ttl, stringValue);
      logger.debug(`Cache SET: ${key} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      logger.error(`Cache set error (${key}):`, error);
      return false;
    }
  }

  // ── Supprimer clé ──────────────────────────────────────

  async delete(key) {
    if (!this.isConnected || !this.client) return false;

    try {
      await this.client.delAsync(key);
      logger.debug(`Cache DELETE: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Cache delete error (${key}):`, error);
      return false;
    }
  }

  // ── Invalidate pattern (tous les dashboards) ──────────

  async invalidatePattern(pattern) {
    if (!this.isConnected || !this.client) return 0;

    try {
      const keys = await this.client.keysAsync(pattern);
      if (keys.length > 0) {
        await this.client.delAsync(keys);
        logger.debug(`Cache INVALIDATE: ${keys.length} keys matching ${pattern}`);
        return keys.length;
      }
      return 0;
    } catch (error) {
      logger.error(`Cache invalidate error (${pattern}):`, error);
      return 0;
    }
  }

  // ── Clés de cache avec TTL ─────────────────────────────

  getCacheKeys() {
    return {
      // Dashboard (3600s = 1h)
      dashboard: (userId) => `dashboard:${userId}`,
      dashboardDirecteur: (period) => `dashboard:directeur:${period}`,
      kpiFlotte: () => 'kpi:flotte',
      kpiAchats: () => 'kpi:achats',
      kpiStocks: () => 'kpi:stocks',

      // Listes paginées (600s = 10min)
      listDemandes: (page, limite) => `list:demandes:${page}:${limite}`,
      listCommandes: (page, limite) => `list:commandes:${page}:${limite}`,
      listVehicules: (page, limite) => `list:vehicules:${page}:${limite}`,
      listArticles: (page, limite) => `list:articles:${page}:${limite}`,

      // Détails (1800s = 30min)
      detailArticle: (id) => `detail:article:${id}`,
      detailVehicule: (id) => `detail:vehicule:${id}`,
      detailCommande: (id) => `detail:commande:${id}`,

      // Alertes (300s = 5min) - refresh rapide
      alertesStocks: () => 'alerts:stocks',
      alertesFlotte: () => 'alerts:flotte',
      alertesCritiques: () => 'alerts:critiques',

      // Rapports (7200s = 2h)
      rapportAudit: (bailleur, period) => `report:audit:${bailleur}:${period}`,
      rapportConformite: (period) => `report:conformite:${period}`,
      rapportInventaire: (magasin) => `report:inventaire:${magasin}`,

      // Fournisseurs (3600s = 1h)
      listFournisseurs: () => 'list:fournisseurs',
      scoresFournisseurs: () => 'scores:fournisseurs',
    };
  }
}

// Middleware Express pour caching automatique
const cacheMiddleware = (cacheService, keyGenerator, ttl = 3600) => {
  return async (req, res, next) => {
    // Seulement pour GET
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = keyGenerator(req);
    if (!cacheKey) {
      return next();
    }

    try {
      const cachedData = await cacheService.get(cacheKey);
      if (cachedData) {
        res.set('X-Cache', 'HIT');
        return res.json(cachedData);
      }
    } catch (error) {
      logger.error('Cache middleware error:', error);
      // Continue sans cache en cas d'erreur
    }

    // Intercepter res.json pour cacher la réponse
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      if (res.statusCode === 200) {
        cacheService.set(cacheKey, data, ttl).catch((err) => {
          logger.error('Cache write error:', err);
        });
        res.set('X-Cache', 'MISS');
      }
      return originalJson(data);
    };

    next();
  };
};

// ── Singleton ──────────────────────────────────────────

const cacheService = new CacheService();

module.exports = { cacheService, cacheMiddleware };
