import type { CondicionEvolucion } from "@santuario/data";
import { gen9 } from "./unir.js";

// Salto provisional cuando la evolución no es por nivel (GDD §7.2: "corregible
// a mano"). Pikachu y compañía aún no tienen un dato mejor.
export const SALTO_SIN_NIVEL = 10;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Tipo de una especie de @pkmn/data. */
type EspeciePkmn = NonNullable<ReturnType<typeof gen9.species.get>>;

// Nombre de @pkmn/data → slug del repo: minúsculas, espacios y puntos a
// guiones, sin apóstrofes ni guiones sobrantes.
const aSlug = (nombre: string) =>
	nombre
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[\s.]+/g, "-")
		.replace(/^-+|-+$/g, "");

const exigirSlug = (nombre: string): string => {
	const id = aSlug(nombre);
	if (!SLUG.test(id)) throw new Error(`"${nombre}": no da un slug válido`);
	return id;
};

// Condición de la evolución; en @pkmn/data vive en la especie evolucionada.
const condicionDe = (meta: EspeciePkmn): CondicionEvolucion => {
	const { evoType, evoItem, evoLevel, evoCondition } = meta;
	if (evoType === "useItem") {
		if (!evoItem)
			throw new Error(`${meta.name}: evolución por objeto sin objeto`);
		return { tipo: "objeto", objeto: exigirSlug(evoItem) };
	}
	if (evoType === "levelFriendship") {
		const condicion: Extract<CondicionEvolucion, { tipo: "amistad" }> = {
			tipo: "amistad",
		};
		const texto = evoCondition?.toLowerCase() ?? "";
		if (texto.includes("day")) condicion.momento = "dia";
		else if (texto.includes("night")) condicion.momento = "noche";
		if (typeof evoLevel === "number") condicion.nivel = evoLevel;
		return condicion;
	}
	if (evoType === "trade")
		return evoItem
			? { tipo: "intercambio", objeto: exigirSlug(evoItem) }
			: { tipo: "intercambio" };
	if (evoType === undefined && typeof evoLevel === "number")
		return { tipo: "nivel", nivel: evoLevel };
	return {
		tipo: "otra",
		detalle: evoCondition ?? evoType ?? "condición sin detalle en @pkmn/data",
	};
};

/** Evoluciones de una especie, ordenadas por destino. */
export function evolucionesDe(
	especie: string,
): { a: string; condicion: CondicionEvolucion }[] {
	const datos = gen9.species.get(especie);
	if (!datos?.exists) throw new Error(`${especie}: no existe en @pkmn/data`);
	const salida = (datos.evos ?? []).map((nombre) => {
		const meta = gen9.species.get(nombre);
		if (!meta?.exists)
			throw new Error(
				`${especie}: la evolución ${nombre} no existe en @pkmn/data`,
			);
		return { a: exigirSlug(meta.name), condicion: condicionDe(meta) };
	});
	salida.sort((a, b) => (a.a < b.a ? -1 : 1));
	return salida;
}

/** Nivel con el que se alcanza la etapa actual de una especie (GDD §7.2). */
export function nivelEtapa(especie: string): number {
	const datos = gen9.species.get(especie);
	if (!datos?.exists) throw new Error(`${especie}: no existe en @pkmn/data`);
	const prevo = datos.prevo;
	if (!prevo) return 0;
	const previa = gen9.species.get(prevo);
	if (!previa?.exists)
		throw new Error(
			`${especie}: su preevolución ${prevo} no existe en @pkmn/data`,
		);
	// Las evoluciones por amistad que cierran una línea nacida en una forma bebé
	// (Pikachu) cuentan como etapa base: el GDD §7.2 y la tarea las esperan a 0.
	if (datos.evoType === "levelFriendship" && !previa.prevo) return 0;
	if (typeof datos.evoLevel === "number" && datos.evoType === undefined)
		return datos.evoLevel;
	return nivelEtapa(prevo) + SALTO_SIN_NIVEL;
}
