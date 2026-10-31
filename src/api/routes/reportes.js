const router = require('express').Router();
const ctrl = require('../controllers/reportesController');
const wrap = require('../middlewares/asyncHandler');

router.get('/consumo', wrap(ctrl.getReporteConsumo));
router.post('/consumo/:id/exportar', wrap(ctrl.postExportar));
router.get('/umbrales', wrap(ctrl.getUmbrales));
router.put('/umbrales', wrap(ctrl.putUmbrales));

module.exports = router;
