import especialidades from "@packs/kanto/especialidades.json";
import especiesCrudas from "@packs/kanto/especies.json";
import habitats from "@packs/kanto/habitats.json";
import balance from "@packs/kanto/santuario.json";
import type { ContextoPartida, EventoSantuario } from "@santuario/core";
import type { Especie } from "@santuario/data";
import { cargarProgresion } from "../expedicion/progresionPack.js";
import { abrirAlmacen } from "../guardado/almacen.js";
import { obtenerSemilla } from "../semilla.js";
import { crearFabrica } from "./fabricar.js";
import { abrirSesion, type Sesion } from "./sesion.js";

/** Especies con las que empieza el Santuario hasta que llegue el Prólogo. */
const INICIALES = ["bulbasaur", "charmander", "squirtle"];

/** Datos del pack que necesita el reductor. */
export const contextoPartida = (): ContextoPartida => ({
	balance: balance as unknown as ContextoPartida["balance"],
	habitats: habitats as unknown as ContextoPartida["habitats"],
	fabricar: crearFabrica(
		especiesCrudas as unknown as Especie[],
		especialidades,
	),
	progresion: cargarProgresion().catalogo,
	especiesDisponibles: (especiesCrudas as unknown as Especie[]).map(
		(e) => e.id,
	),
});

type Abierta = { sesion: Sesion; avisos: string[] };
let abierta: { ranura: string; promesa: Promise<Abierta> } | undefined;

/**
 * Ranura de la partida: con `?semilla=` cada semilla tiene la suya (así las pruebas
 * no se pisan entre sí ni con la partida real); sin ella, la partida normal.
 */
export function ranuraActual(consulta = location.search): string {
	const semilla = new URLSearchParams(consulta).get("semilla");
	return semilla === null ? "partida" : `partida:${semilla}`;
}

/**
 * La partida abierta (la misma para todas las escenas). Se carga una vez; si falla,
 * el siguiente intento vuelve a probar en lugar de recordar el error.
 */
export function obtenerSesion(): Promise<Abierta> {
	const ranura = ranuraActual();
	if (abierta?.ranura === ranura) return abierta.promesa;
	const promesa = (async () =>
		abrirSesion({
			almacen: await abrirAlmacen(),
			ranura,
			semilla: obtenerSemilla(),
			ctx: contextoPartida(),
			iniciales: INICIALES,
		}))();
	abierta = { ranura, promesa };
	actual = undefined;
	promesa.then(({ sesion }) => {
		if (abierta?.promesa === promesa) actual = sesion;
	});
	promesa.catch(() => {
		if (abierta?.promesa === promesa) abierta = undefined;
	});
	return promesa;
}

let actual: Sesion | undefined;

/**
 * La sesión ya abierta, si la hay. Las escenas de la expedición la usan sin forzar
 * su carga: si nadie entró al Santuario (expedición de prueba), no hay nada que guardar.
 */
export const sesionAbierta = (): Sesion | undefined => actual;

/** Lo que pasó al volver de una expedición, para mostrarlo en el resumen del Santuario. */
export interface ResumenPendiente {
	eventos: EventoSantuario[];
	recursosAntes: Record<string, number>;
}
let pendiente: ResumenPendiente | undefined;
export const guardarResumenPendiente = (r: ResumenPendiente): void => {
	pendiente = r;
};
/** Entrega el resumen pendiente una sola vez. */
export const tomarResumenPendiente = (): ResumenPendiente | undefined => {
	const r = pendiente;
	pendiente = undefined;
	return r;
};
