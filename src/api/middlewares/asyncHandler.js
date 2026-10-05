/** Envuelve controllers async para que sus rechazos lleguen al errorHandler. */
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
