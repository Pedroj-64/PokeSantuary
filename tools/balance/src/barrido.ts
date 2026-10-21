import { type DatosSimulacion, simular } from "./simular.js";

/** Una configuración del barrido de balance. */
export interface ConfiguracionBarrido {
	/** Nombre que se muestra en la tabla (p. ej. "G0 · 1 llama · equipo 3"). */
	nombre: string;
	/** Nivel de gimnasio inicial (0..5). */
	nivelGimnasio: number;
	/** Llamas iniciales del Farol. */
	llamas: number;
	/** Número de especies distintas con las que empieza el equipo (1..6). */
	tamanoEquipo: number;
}

/** Resultado de una configuración del barrido. */
export interface FilaBarrido {
	nombre: string;
	tasa: number;
	victorias: number;
	total: number;
	muertesPorPiso: [number, number, number];
	/** Nivel medio al jefe; solo existe si el pack carga progresión. */
	nivelMedioAlJefe?: [number, number, number];
}

/**
 * Simula las mismas semillas con cada configuración, aplicando su nivel de
 * gimnasio, sus llamas y su tamaño de equipo. El resultado es determinista.
 */
export async function barrer(
	semillas: readonly string[],
	datos: DatosSimulacion,
	configs: readonly ConfiguracionBarrido[],
): Promise<FilaBarrido[]> {
	const filas: FilaBarrido[] = [];
	for (const config of configs) {
		const datosConfig: DatosSimulacion = {
			...datos,
			llamas: config.llamas,
			tamanoEquipo: config.tamanoEquipo,
		};
		if (datos.progresion !== undefined) {
			datosConfig.progresion = {
				...datos.progresion,
				nivelGimnasio: config.nivelGimnasio,
			};
		}
		const resumen = await simular(semillas, datosConfig);
		filas.push({
			nombre: config.nombre,
			tasa: resumen.tasa,
			victorias: resumen.victorias,
			total: resumen.total,
			muertesPorPiso: resumen.muertesPorPiso,
			...(resumen.nivelMedioAlJefe === undefined
				? {}
				: { nivelMedioAlJefe: resumen.nivelMedioAlJefe }),
		});
	}
	return filas;
}
