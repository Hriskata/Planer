const fs = require('fs');
const path = require('path');

// Single source of truth for where uploaded files live on disk — shared by
// routes/uploads.js (task photos) and routes/library.js (brand assets), and by
// deleteUploadedFile below (called from routes/tasks.js and routes/library.js
// whenever a row referencing a file is deleted or its file replaced).
const UPLOADS_DIR = process.env.UPLOADS_DIR || './uploads';
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Deletes a previously uploaded file given its web-facing path (e.g. '/uploads/<uuid>.jpg',
// as stored in tasks.image_path / library_assets.file_path). Best-effort and fire-and-forget
// — the file may already be gone (a previous failed delete, manual cleanup), so a missing
// file is logged but not treated as an error the caller needs to handle.
function deleteUploadedFile(webPath) {
  if (!webPath || !webPath.startsWith('/uploads/')) return;
  const filePath = path.join(UPLOADS_DIR, path.basename(webPath));
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('Неуспешно изтриване на файл', filePath, ':', err.message);
    }
  });
}

module.exports = { UPLOADS_DIR, deleteUploadedFile };
