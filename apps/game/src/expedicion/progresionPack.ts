import aprendizajeCrudo from "@packs/kanto/aprendizaje.json?raw";
import especialidadesCrudo from "@packs/kanto/especialidades.json?raw";
import especiesCrudo from "@packs/kanto/especies.json?raw";
import evolucionesCrudo from "@packs/kanto/evoluciones.json?raw";
import movimientosCrudo from "@packs/kanto/movimientos.json?raw";
import nivelesCrudo from "@packs/kanto/niveles.json?raw";
import type { CatalogoProgresion, ContextoProgresion } from "@santuario/core";
import {
	AprendizajeSchema,
	EspecialidadesSchema,
	EspecieSchema,
	EvolucionesSchema,
	MovimientoSchema,
	NivelesSchema,
} from "@santuario/data";
import { z } from "zod";

/** Datos de progresión del pack kanto, ya validados y en la forma que usa el núcleo. */
export interface DatosProgresion {
	niveles: ReturnType<typeof NivelesSchema.parse>;
	/** Para el puente Santuario ↔ expedición. */
	catalogo: CatalogoProgresion;
	/** Para `registrarVictoria`, `elegirOlvido` y `evolucionar`. */
	contexto: ContextoProgresion;
	/** Potencia de cada movimiento (0 = sin daño directo). */
	poder: Readonly<Record<string, number>>;
}

let memo: DatosProgresion | undefined;

/** Datos de progresión del pack; se validan una vez y lanzan si el JSON no cuadra. */
export function cargarProgresion(): DatosProgresion {
	if (memo) return memo;
	const niveles = NivelesSchema.parse(JSON.parse(nivelesCrudo));
	const aprendizaje = AprendizajeSchema.parse(JSON.parse(aprendizajeCrudo));
	const evoluciones = EvolucionesSchema.parse(JSON.parse(evolucionesCrudo));
	const especialidades = EspecialidadesSchema.parse(
		JSON.parse(especialidadesCrudo),
	);
	const especies = z.array(EspecieSchema).parse(JSON.parse(especiesCrudo));
	// Potencia de cada movimiento: la selección de movimientos iniciales exige al menos dos ataques.
	const poder = Object.fromEntries(
		z
			.array(MovimientoSchema)
			.parse(JSON.parse(movimientosCrudo))
			.map((m) => [m.id, m.potencia ?? 0]),
	);
	const catalogo: CatalogoProgresion = Object.fromEntries(
		Object.entries(evoluciones).map(([id, datos]) => {
			const especie = especies.find((e) => e.id === id);
			return [
				id,
				{
					aprendizaje: aprendizaje[id] ?? [],
					nivelEtapa: datos.nivelEtapa,
					tipos: especie?.tipos ?? [],
					preferidos: especie?.trabajos ?? [],
					especialidades: especialidades[id] ?? [],
					poder,
				},
			];
		}),
	);
	memo = {
		niveles,
		catalogo,
		poder,
		contexto: {
			tabla: niveles.subida,
			aprendizaje,
			evoluciones: Object.fromEntries(
				Object.entries(evoluciones).map(([id, d]) => [id, d.evoluciones]),
			),
			// La expedición no sabe la hora del Santuario: evolucionar por amistad de día/noche se resuelve allí.
			momento: "dia",
		},
	};
	return memo;
}
