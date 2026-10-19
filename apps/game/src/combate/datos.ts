import {
	EspecieSchema,
	MovimientoSchema,
	type SetCombate,
	SetCombateSchema,
} from "@santuario/data";
import { z } from "zod";
import { idiomaActual } from "../i18n/index.js";
import type { NombresVisibles } from "./mensajes.js";

/** Datos del pack que necesita la escena, validados con sus esquemas (lanza si el JSON no cuadra). */
export function construirDatosCombate(
	especiesCrudo: string,
	movimientosCrudo: string,
	setsCrudo: string,
): {
	sets: SetCombate[];
	nombres: NombresVisibles;
	tipoDeMovimiento(slug: string): string;
	/** Tipo principal de la especie (para el sustituto del sprite). */
	tipoDeEspecie(slug: string): string | undefined;
} {
	const especies = z.array(EspecieSchema).parse(JSON.parse(especiesCrudo));
	const movimientos = z
		.array(MovimientoSchema)
		.parse(JSON.parse(movimientosCrudo));
	const sets = z.array(SetCombateSchema).parse(JSON.parse(setsCrudo));
	return {
		sets,
		nombres: {
			especie: (slug) =>
				especies.find((e) => e.id === slug)?.nombre[idiomaActual()] ?? slug,
			movimiento: (slug) =>
				movimientos.find((m) => m.id === slug)?.nombre[idiomaActual()] ?? slug,
		},
		tipoDeEspecie: (slug) => especies.find((e) => e.id === slug)?.tipos[0],
		tipoDeMovimiento: (slug) =>
			movimientos.find((m) => m.id === slug)?.tipo ?? "normal",
	};
}
