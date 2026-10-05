const path = require('path');
const multer = require('multer');
const config = require('../../config');

/**
 * La imagen queda en memoria (req.file.buffer) y la estrategia de
 * almacenamiento decide dónde persistirla (disco local o Supabase Storage).
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxBytes },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (config.uploads.extensiones.includes(ext)) return cb(null, true);
    return cb(new Error(`Formato no permitido. Válidos: ${config.uploads.extensiones.join(', ')}.`));
  },
});

module.exports = { upload };
