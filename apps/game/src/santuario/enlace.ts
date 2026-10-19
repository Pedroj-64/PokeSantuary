import type { EstadoExpedicion } from "@santuario/core";
import { guardarResumenPendiente, sesionAbierta } from "./sesionGlobal.js";

/**
 * Enlace entre las escenas de la expedición y la partida del Santuario. Se carga bajo
 * demanda (no entra en la carga inicial) y no hace nada si la expedición no salió del
 * Santuario (la de prueba de la lista de especies).
 */

/** ¿Hay una expedición en curso que salió del Santuario? */
export const esDeSantuario = (): boolean =>
	sesionAbierta()?.partida().expedicion !== undefined;

/** Guarda el estado de la expedición en la partida (se llama al mostrar el mapa tras cada nodo). */
export function guardarExpedicion(estado: EstadoExpedicion): void {
	const sesion = sesionAbierta();
	if (sesion?.partida().expedicion === undefined) return;
	sesion.despachar({ tipo: "actualizarExpedicion", expedicion: estado });
}

/**
 * Cierra la expedición: la liquida en el Santuario (dinero, capturados, agotados) y resuelve
 * el Atardecer. Deja el resumen para que el Santuario lo muestre al abrirse.
 */
export function volverAlSantuario(estado: EstadoExpedicion): void {
	const sesion = sesionAbierta();
	if (sesion?.partida().expedicion === undefined) return;
	sesion.despachar({ tipo: "actualizarExpedicion", expedicion: estado });
	const recursosAntes = { ...sesion.partida().santuario.recursos };
	const eventos = sesion.despachar({ tipo: "volverDeExpedicion" });
	guardarResumenPendiente({ eventos, recursosAntes });
}
