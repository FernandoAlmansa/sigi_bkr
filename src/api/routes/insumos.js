const router = require('express').Router();
const ctrl = require('../controllers/insumosController');
const wrap = require('../middlewares/asyncHandler');
const { upload } = require('../middlewares/upload');

router.get('/tipos', wrap(ctrl.listarTipos));
router.get('/resumen', wrap(ctrl.resumen));
router.get('/', wrap(ctrl.listarInsumos));
router.get('/:id', wrap(ctrl.obtenerInsumo));
router.post('/', wrap(ctrl.crearInsumo));
router.patch('/:id', wrap(ctrl.actualizarInsumo));
router.delete('/:id', wrap(ctrl.eliminarInsumo));
router.post('/:id/imagen', upload.single('imagen'), wrap(ctrl.subirImagen));

module.exports = router;
