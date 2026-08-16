const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { resolveViewedOwnerId } = require('../calendarAccess');
const { UPLOADS_DIR, deleteUploadedFile } = require('../uploadStorage');

const router = express.Router();

// Broader than routes/uploads.js's image-only set — brand assets are logos/photos
// (images), font files, and the occasional brand-guideline PDF (folded into "Друго"
// rather than a dedicated Document type, since the fixed type list stays short).
const ALLOWED_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'font/ttf': '.ttf',
  'font/otf': '.otf',
  'font/woff': '.woff',
  'font/woff2': '.woff2',
  'application/x-font-ttf': '.ttf',
  'application/vnd.ms-opentype': '.otf',
  'application/pdf': '.pdf',
};
const MAX_SIZE = 15 * 1024 * 1024; // 15MB — fonts/PDFs run larger than task photos

// Loose on purpose — 3 or 6 hex digits, '#' optional (normalized to always include it
// below), same minimal-validation spirit as the rest of this app's free-text fields.
const HEX_RE = /^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$/;

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  // fileFilter below always rejects an unrecognized mimetype first, so
  // ALLOWED_TYPES[file.mimetype] is guaranteed to exist by the time this runs.
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${ALLOWED_TYPES[file.mimetype]}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES[file.mimetype]) {
      return cb(new Error('Неподдържан тип файл.'));
    }
    cb(null, true);
  },
});

// Owner's own library, or someone else's if they've shared their calendar with the
// caller — same access rule as tasks (see calendarAccess.js), except here it also
// grants upload rights, not just read: a shared collaborator adding a client logo to
// the owner's library is the whole point, per how this feature was scoped.
router.get('/', (req, res) => {
  const ownerId = resolveViewedOwnerId(req);
  if (ownerId === null) {
    return res.status(403).json({ error: 'Нямаш достъп до тази библиотека.' });
  }
  const rows = db
    .prepare(
      `SELECT la.id, la.owner_id, la.uploaded_by, la.client, la.type, la.title,
              la.file_path, la.text_content, la.hex_code, la.rgb_value,
              la.created_at, la.updated_at,
              u.username AS uploaded_by_username
       FROM library_assets la
       JOIN users u ON u.id = la.uploaded_by
       WHERE la.owner_id = ?
       ORDER BY la.created_at DESC`
    )
    .all(ownerId);
  res.json(rows);
});

router.post('/', upload.single('file'), (req, res) => {
  const ownerId = resolveViewedOwnerId(req);
  if (ownerId === null) {
    return res.status(403).json({ error: 'Нямаш достъп до тази библиотека.' });
  }

  const { client, type, title } = req.body || {};
  const textContent = typeof req.body?.text_content === 'string' ? req.body.text_content.trim() : '';
  const hexInput = typeof req.body?.hex_code === 'string' ? req.body.hex_code.trim() : '';
  const rgbInput = typeof req.body?.rgb_value === 'string' ? req.body.rgb_value.trim() : '';
  const filePath = req.file ? `/uploads/${req.file.filename}` : null;

  const errors = [];
  if (typeof client !== 'string' || !client.trim()) errors.push('client е задължителен.');
  if (typeof type !== 'string' || !type.trim()) errors.push('type е задължителен.');
  if (typeof title !== 'string' || !title.trim()) errors.push('title е задължителен.');

  let hexCode = null;
  if (hexInput) {
    if (!HEX_RE.test(hexInput)) {
      errors.push('hex_code трябва да е валиден HEX код (напр. #3B82F6).');
    } else {
      hexCode = hexInput.startsWith('#') ? hexInput : `#${hexInput}`;
    }
  }

  let rgbValue = null;
  if (rgbInput) {
    const parts = rgbInput.split(',').map((p) => p.trim());
    const nums = parts.map(Number);
    if (parts.length !== 3 || nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      errors.push('rgb_value трябва да е във формат "R, G, B" (0-255 всяко).');
    } else {
      rgbValue = nums.join(', ');
    }
  }

  // Only 'Цвят' assets can rely on hex/rgb alone — everything else still needs a file
  // or text, exactly as before; hex/rgb simply widen what counts as "something was
  // provided" rather than replacing the rule.
  if (!filePath && !textContent && !hexCode && !rgbValue) {
    errors.push('Трябва да качиш файл, да въведеш текст, или да зададеш HEX/RGB.');
  }
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const result = db
    .prepare(
      `INSERT INTO library_assets (owner_id, uploaded_by, client, type, title, file_path, text_content, hex_code, rgb_value)
       VALUES (@ownerId, @uploadedBy, @client, @type, @title, @filePath, @textContent, @hexCode, @rgbValue)`
    )
    .run({
      ownerId,
      uploadedBy: req.user.id,
      client: client.trim(),
      type: type.trim(),
      title: title.trim(),
      filePath,
      textContent: textContent || null,
      hexCode,
      rgbValue,
    });

  const created = db
    .prepare(
      `SELECT la.*, u.username AS uploaded_by_username
       FROM library_assets la JOIN users u ON u.id = la.uploaded_by
       WHERE la.id = ?`
    )
    .get(result.lastInsertRowid);
  res.status(201).json(created);
});

router.delete('/:id', (req, res) => {
  const asset = db.prepare('SELECT * FROM library_assets WHERE id = ?').get(req.params.id);
  if (!asset) {
    return res.status(404).json({ error: 'Материалът не е намерен.' });
  }
  // Owner of the library has admin-style rights (can delete anything in it); anyone
  // else may only delete what they themselves uploaded — see the schema comment for why
  // owner_id and uploaded_by are tracked separately.
  const isOwner = asset.owner_id === req.user.id;
  const isUploader = asset.uploaded_by === req.user.id;
  if (!isOwner && !isUploader) {
    return res.status(403).json({ error: 'Можеш да триеш само собствените си материали.' });
  }
  db.prepare('DELETE FROM library_assets WHERE id = ?').run(asset.id);
  res.status(204).send();

  if (asset.file_path) {
    deleteUploadedFile(asset.file_path);
  }
});

// Multer/fileFilter errors (wrong type, too large) land here instead of the generic
// 500 handler in app.js, so the real reason reaches the client — same pattern as
// routes/uploads.js.
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Файлът е твърде голям (максимум 15MB).' });
  }
  res.status(400).json({ error: err.message || 'Грешка при качване на файла.' });
});

module.exports = router;
