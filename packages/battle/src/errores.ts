/** Valor de `Error.name` de una elección rechazada por ilegal; sobrevive a Comlink (que solo restaura `name` y `message`). */
export const NOMBRE_ELECCION_ILEGAL = "EleccionIlegal";

/** Error de una elección ilegal (fuera de turno, sin PP, a un debilitado...): no es fatal, el combate sigue válido. */
export function eleccionIlegal(mensaje: string): Error {
	const e = new Error(mensaje);
	e.name = NOMBRE_ELECCION_ILEGAL;
	return e;
}

/** ¿Es un rechazo por elección ilegal? Todo lo demás (Worker caído, plazo, sesión rota) es fatal. */
export function esEleccionIlegal(e: unknown): boolean {
	return e instanceof Error && e.name === NOMBRE_ELECCION_ILEGAL;
}
