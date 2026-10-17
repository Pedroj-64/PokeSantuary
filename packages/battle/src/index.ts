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
} from "./combate.js";
export { eleccionIlegal, esEleccionIlegal } from "./errores.js";
export type { DatosMovimiento, Estimador } from "./ia.js";
export type { EventoCombate, Lado } from "./protocolo.js";
