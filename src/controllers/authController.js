// src/controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, transaction, saveDatabase } = require('../config/database');
const logger = require('../config/logger');
const { envoyerEmail } = require('../services/emailService');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;
const MAX_TENTATIVES = 5;
const VERROUILLAGE_MINUTES = 15;
const INACTIVITE_JOURS = parseInt(process.env.INACTIVITY_DAYS) || 45;
const RESET_TOKEN_HEURES = parseInt(process.env.RESET_TOKEN_HOURS) || 24;

const connexion = async (req, res) => {
  const { email, mot_de_passe, se_souvenir } = req.body;
  const adresse_ip = req.ip;
  const user_agent = req.headers['user-agent'];

  try {
    const result = await query(
      `SELECT u.*, r.code AS role_code, r.permissions
       FROM utilisateurs u
       JOIN roles r ON u.role_id = r.id
       WHERE u.email = ?`,
      [email.toLowerCase().trim()]
    );

    const utilisateur = result.rows[0];

    const logAction = async (action) => {
      if (utilisateur) {
        try {
          await query(
            `INSERT INTO journaux_connexion (utilisateur_id, action, adresse_ip, user_agent)
             VALUES (?, ?, ?, ?)`,
            [utilisateur.id, action, adresse_ip, user_agent]
          );
        } catch (e) {
          logger.warn('logAction ignoré:', e.message);
        }
      }
    };

    if (!utilisateur) {
      return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
    }

    if (!utilisateur.actif) {
      await logAction('echec_compte_desactive');
      return res.status(403).json({ success: false, message: "Votre compte a été désactivé. Contactez l'administrateur." });
    }

    if (utilisateur.verrouille_jusqu_a && new Date(utilisateur.verrouille_jusqu_a) > new Date()) {
      await logAction('echec_compte_verrouille');
      const minutes = Math.ceil((new Date(utilisateur.verrouille_jusqu_a) - new Date()) / 60000);
      return res.status(423).json({ success: false, message: `Compte verrouillé. Réessayez dans ${minutes} minute(s).` });
    }

    if (utilisateur.inactif_depuis) {
      const joursInactif = Math.floor((new Date() - new Date(utilisateur.inactif_depuis)) / 86400000);
      if (joursInactif > INACTIVITE_JOURS) {
        await logAction('echec_inactivite');
        return res.status(403).json({ success: false, message: "Compte bloqué pour inactivité. Contactez l'administrateur." });
      }
    }

    const mdpValide = await bcrypt.compare(mot_de_passe, utilisateur.mot_de_passe_hash);

    if (!mdpValide) {
      const nouveauxEchecs = utilisateur.tentatives_echec + 1;
      const verrouillage = nouveauxEchecs >= MAX_TENTATIVES
        ? new Date(Date.now() + VERROUILLAGE_MINUTES * 60000).toISOString()
        : null;

      await query(
        `UPDATE utilisateurs SET tentatives_echec = ?, verrouille_jusqu_a = ? WHERE id = ?`,
        [nouveauxEchecs, verrouillage, utilisateur.id]
      );
      await logAction('echec');
      saveDatabase();

      if (verrouillage) {
        return res.status(423).json({ success: false, message: `Trop de tentatives. Compte verrouillé ${VERROUILLAGE_MINUTES} minutes.` });
      }
      const restantes = MAX_TENTATIVES - nouveauxEchecs;
      return res.status(401).json({ success: false, message: `Email ou mot de passe incorrect. ${restantes} tentative(s) restante(s).` });
    }

    await query(
      `UPDATE utilisateurs SET
         tentatives_echec = 0,
         verrouille_jusqu_a = NULL,
         derniere_connexion = datetime('now'),
         inactif_depuis = NULL
       WHERE id = ?`,
      [utilisateur.id]
    );
    await logAction('connexion');
    saveDatabase();

    const expiresIn = se_souvenir ? '7d' : (process.env.JWT_EXPIRES_IN || '8h');
    const token = jwt.sign(
      { userId: utilisateur.id, email: utilisateur.email, role: utilisateur.role_code },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    const mdpExpire = utilisateur.mot_de_passe_expire_le && new Date(utilisateur.mot_de_passe_expire_le) < new Date();

    return res.json({
      success: true,
      message: 'Connexion réussie',
      data: {
        token,
        utilisateur: {
          id: utilisateur.id,
          nom: utilisateur.nom,
          prenom: utilisateur.prenom,
          email: utilisateur.email,
          role: utilisateur.role_code,
          permissions: typeof utilisateur.permissions === 'string'
            ? JSON.parse(utilisateur.permissions)
            : utilisateur.permissions,
          site: utilisateur.site,
          departement: utilisateur.departement,
          premiere_connexion: !!utilisateur.premiere_connexion,
          mdp_expire: mdpExpire
        }
      }
    });
  } catch (err) {
    logger.error('Erreur connexion:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const changerMotDePasse = async (req, res) => {
  const { ancien_mot_de_passe, nouveau_mot_de_passe } = req.body;
  const utilisateurId = req.utilisateur.id;

  try {
    const result = await query('SELECT mot_de_passe_hash FROM utilisateurs WHERE id = ?', [utilisateurId]);
    const utilisateur = result.rows[0];

    const valide = await bcrypt.compare(ancien_mot_de_passe, utilisateur.mot_de_passe_hash);
    if (!valide) {
      return res.status(400).json({ success: false, message: 'Ancien mot de passe incorrect' });
    }

    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!regex.test(nouveau_mot_de_passe)) {
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial'
      });
    }

    const hash = await bcrypt.hash(nouveau_mot_de_passe, BCRYPT_ROUNDS);
    await query(
      `UPDATE utilisateurs SET
         mot_de_passe_hash = ?,
         mot_de_passe_expire_le = datetime('now', '+90 days'),
         premiere_connexion = 0
       WHERE id = ?`,
      [hash, utilisateurId]
    );
    saveDatabase();
    return res.json({ success: true, message: 'Mot de passe modifié avec succès' });
  } catch (err) {
    logger.error('Erreur changement mdp:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const demandeResetMotDePasse = async (req, res) => {
  const { email } = req.body;

  try {
    const result = await query(
      'SELECT id, nom, prenom FROM utilisateurs WHERE email = ? AND actif = 1',
      [email]
    );

    if (!result.rows[0]) {
      return res.json({ success: true, message: 'Si cet email existe, un lien de réinitialisation a été envoyé.' });
    }

    const utilisateur = result.rows[0];
    const token = crypto.randomBytes(64).toString('hex');
    const expiration = new Date(Date.now() + RESET_TOKEN_HEURES * 3600000).toISOString();

    await query('UPDATE tokens_reinitialisation SET utilise = 1 WHERE utilisateur_id = ?', [utilisateur.id]);
    await query(
      'INSERT INTO tokens_reinitialisation (utilisateur_id, token, expire_le) VALUES (?, ?, ?)',
      [utilisateur.id, token, expiration]
    );
    saveDatabase();

    const lienReset = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await envoyerEmail({
      to: email,
      subject: 'MSI BF - Réinitialisation de votre mot de passe',
      html: `<p>Bonjour ${utilisateur.prenom} ${utilisateur.nom},</p>
             <p>Cliquez ici pour réinitialiser votre mot de passe : <a href="${lienReset}">${lienReset}</a></p>
             <p>Ce lien est valable ${RESET_TOKEN_HEURES} heure(s).</p>`
    });

    return res.json({ success: true, message: 'Si cet email existe, un lien de réinitialisation a été envoyé.' });
  } catch (err) {
    logger.error('Erreur reset mdp:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const resetMotDePasse = async (req, res) => {
  const { token, nouveau_mot_de_passe } = req.body;

  try {
    const result = await query(
      `SELECT tr.*, u.id AS uid FROM tokens_reinitialisation tr
       JOIN utilisateurs u ON u.id = tr.utilisateur_id
       WHERE tr.token = ? AND tr.utilise = 0 AND tr.expire_le > datetime('now')`,
      [token]
    );

    if (!result.rows[0]) {
      return res.status(400).json({ success: false, message: 'Lien invalide ou expiré' });
    }

    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!regex.test(nouveau_mot_de_passe)) {
      return res.status(400).json({ success: false, message: 'Mot de passe insuffisamment sécurisé' });
    }

    const hash = await bcrypt.hash(nouveau_mot_de_passe, BCRYPT_ROUNDS);
    await transaction(async () => {
      await query(
        `UPDATE utilisateurs SET
           mot_de_passe_hash = ?,
           mot_de_passe_expire_le = datetime('now', '+90 days'),
           tentatives_echec = 0,
           verrouille_jusqu_a = NULL,
           premiere_connexion = 0
         WHERE id = ?`,
        [hash, result.rows[0].uid]
      );
      await query('UPDATE tokens_reinitialisation SET utilise = 1 WHERE token = ?', [token]);
    });

    return res.json({ success: true, message: 'Mot de passe réinitialisé avec succès' });
  } catch (err) {
    logger.error('Erreur reset mdp:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

const profil = async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.nom, u.prenom, u.email, u.telephone, u.site, u.departement,
              u.derniere_connexion, u.mot_de_passe_expire_le,
              r.code AS role, r.libelle AS role_libelle, r.permissions
       FROM utilisateurs u JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`,
      [req.utilisateur.id]
    );
    const user = result.rows[0];
    if (user && typeof user.permissions === 'string') {
      user.permissions = JSON.parse(user.permissions);
    }
    return res.json({ success: true, data: user });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};

module.exports = { connexion, changerMotDePasse, demandeResetMotDePasse, resetMotDePasse, profil };
