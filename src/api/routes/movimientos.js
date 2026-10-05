const router = require('express').Router();
const ctrl = require('../controllers/movimientosController');
const wrap = require('../middlewares/asyncHandler');

router.get('/', wrap(ctrl.listarMovimientos));
router.post('/ingreso', wrap(ctrl.registrarIngreso));
router.post('/egreso', wrap(ctrl.registrarEgreso));
router.post('/ajuste', wrap(ctrl.registrarAjuste));

module.exports = router;
