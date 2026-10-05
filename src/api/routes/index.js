const router = require('express').Router();

router.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
router.use('/insumos', require('./insumos'));
router.use('/movimientos', require('./movimientos'));

module.exports = router;
