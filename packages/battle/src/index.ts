// Entrada segura para el paquete principal: tipos y el cliente del Worker.
// Combate, la IA y la sesión viven en `@santuario/battle/servidor`.

export type {
	CombateAbierto,
	CombateRemoto,
	OpcionesCliente,
	OpcionesCombate,
	ResultadoTurno,
} from "./cliente.js";
export { abrirCombate } from "./cliente.js";
export type {
	ActivoPublico,
	Eleccion,
	MiembroEquipo,
	MiembroPeticion,
	OpcionMovimiento,
	Peticion,
	TerrenoFisura,
} from "./combate.js";
export { eleccionIlegal, esEleccionIlegal } from "./errores.js";
export type {
	DatosCombate,
	PreparacionCombate,
} from "./expedicion/combateNodo.js";
export {
	cerrarCombate,
	destinoTrasCombate,
	dineroDeNodo,
	prepararCombate,
	resultadoDeCombate,
} from "./expedicion/combateNodo.js";
export { crearRival, type TamanosRival } from "./expedicion/encuentros.js";
export { crearEquipos } from "./expedicion/equipos.js";
export { bolasIniciales, expedicionInicial } from "./expedicion/inicio.js";
export type { DatosMovimiento, Estimador } from "./ia.js";
export type { EventoCombate, Lado } from "./protocolo.js";
