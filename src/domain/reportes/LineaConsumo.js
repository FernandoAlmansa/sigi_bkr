/**
 * Resultado del análisis para un insumo: consumo del período, cantidad de
 * egresos, promedio diario, stock al generar, días de cobertura y estado.
 * promedioDiario y diasCobertura quedan en null cuando no hay proyección
 * (sin rotación o muestra insuficiente): un cero sería una afirmación falsa.
 */
class LineaConsumo {
  constructor({
    idInsumo, nombre, unidad, tipoNombre = null,
    consumoTotal = 0, cantidadEgresos = 0, promedioDiario = null,
    stockAlGenerar = 0, diasCobertura = null, estado = null,
  }) {
    this.idInsumo = idInsumo;
    this.nombre = nombre;
    this.unidad = unidad;
    this.tipoNombre = tipoNombre;
    this.consumoTotal = Number(consumoTotal);
    this.cantidadEgresos = Number(cantidadEgresos);
    this.promedioDiario = promedioDiario === null ? null : Number(promedioDiario);
    this.stockAlGenerar = Number(stockAlGenerar);
    this.diasCobertura = diasCobertura === null ? null : Number(diasCobertura);
    this.estado = estado;
  }

  /** La asigna ClasificadorCobertura. Sin proyección no hay promedio ni cobertura que informar. */
  asignarClasificacion(estado, diasCobertura) {
    this.estado = estado;
    this.diasCobertura = diasCobertura;
    if (diasCobertura === null) this.promedioDiario = null;
  }

  get tieneProyeccion() {
    return this.diasCobertura !== null;
  }
}

module.exports = LineaConsumo;
