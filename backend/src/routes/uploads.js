const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const router = express.Router();

const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  // Random filename (not the original) — avoids path-traversal/collision issues and
  // doesn't leak the uploader's original filename.
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${ALLOWED_TYPES[file.mimetype]}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES[file.mimetype]) {
      return cb(new Error('Разрешени са само изображения (jpeg, png, webp, gif).'));
    }
    cb(null, true);
  },
});

router.post('/', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Няма качен файл.' });
  }
  res.status(201).json({ path: `/uploads/${req.file.filename}` });
});

// Multer/fileFilter errors (wrong type, too large) land here instead of the generic
// 500 handler in app.js, so the real reason reaches the client.
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Файлът е твърде голям (максимум 5MB).' });
  }
  res.status(400).json({ error: err.message || 'Грешка при качване на файла.' });
});

module.exports = router;
