// src/services/emailService.js
const nodemailer = require('nodemailer');
const logger = require('../config/logger');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

const envoyerEmail = async ({ to, subject, html, text }) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@mariestopes-bf.org',
      to, subject, html, text
    });
    logger.info(`Email envoyé à ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    logger.error('Erreur envoi email:', err);
    throw err;
  }
};

module.exports = { envoyerEmail };
