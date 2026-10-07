const router = require('express').Router();
const ctrl = require('../controllers/unidadesController');
const wrap = require('../middlewares/asyncHandler');

router.get('/', wrap(ctrl.listar));
router.get('/presentaciones', wrap(ctrl.nombresPresentaciones));
router.post('/', wrap(ctrl.crear));
router.patch('/:id', wrap(ctrl.actualizar));
router.delete('/:id', wrap(ctrl.eliminar));

module.exports = router;
