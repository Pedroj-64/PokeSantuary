import { type Accion, type Estado, type Evento, paso } from "./paso.js";
import { crearRng } from "./rng.js";

/** Reproduce `acciones` desde el estado inicial con la `semilla` dada. */
export function reproducir(
	semilla: string,
	acciones: Accion[],
): { estado: Estado; eventos: Evento[] } {
	const rng = crearRng(semilla);
	let estado: Estado = { turno: 0, bayas: 0 };
	const eventos: Evento[] = [];
	for (const accion of acciones) {
		const r = paso(estado, accion, rng);
		estado = r.estado;
		eventos.push(...r.eventos);
	}
	return { estado, eventos };
}
