// src/middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = process.env.UPLOAD_DIR || '/app/uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subDir = req.params.module || 'general';
    const dir = path.join(uploadDir, subDir);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = (process.env.ALLOWED_MIME_TYPES || 'image/jpeg,image/png,application/pdf').split(',');
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Type de fichier non autorisé'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 }
});

module.exports = upload;
