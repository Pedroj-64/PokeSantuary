import type { EventoSantuario } from "@santuario/core";

/** Una línea del resumen: clave i18n y sus parámetros (el texto lo pone la escena con `t`). */
export interface LineaResumen {
	clave: string;
	params?: Record<string, string | number>;
}

/** Las bayas de todos los sabores cuentan como un solo recurso en el resumen. */
const recursoVisible = (id: string) => (id.startsWith("baya:") ? "baya" : id);

function totales(r: Readonly<Record<string, number>>): Map<string, number> {
	const m = new Map<string, number>();
	for (const [k, v] of Object.entries(r))
		m.set(recursoVisible(k), (m.get(recursoVisible(k)) ?? 0) + v);
	return m;
}

/**
 * Convierte lo que pasó en una jornada en líneas para el panel de resumen: lo que
 * produjo el Santuario (recursos que subieron) y los eventos del núcleo.
 */
export function resumenDeJornada(
	eventos: readonly EventoSantuario[],
	antes: Readonly<Record<string, number>>,
	despues: Readonly<Record<string, number>>,
	nombre: (uid: string) => string,
): LineaResumen[] {
	const lineas: LineaResumen[] = [];
	const a = totales(antes);
	for (const [recurso, ahora] of totales(despues)) {
		const n = ahora - (a.get(recurso) ?? 0);
		if (n > 0)
			lineas.push({
				clave: "santuario.resumen.produccion",
				params: { recurso, n },
			});
	}
	let sinBayas = 0;
	let terreno = 0;
	for (const e of eventos) {
		switch (e.tipo) {
			case "obraTerminada":
				lineas.push({
					clave: "santuario.resumen.obra",
					params: { edificio: String(e.edificio) },
				});
				break;
			case "habitatNuevo":
				lineas.push({
					clave: "santuario.resumen.habitat",
					params: { habitat: String(e.id) },
				});
				break;
			case "avisoInquietud":
				lineas.push({
					clave: "santuario.resumen.inquietud",
					params: { nombre: nombre(String(e.uid)) },
				});
				break;
			case "seVa":
				lineas.push({
					clave: "santuario.resumen.seVa",
					params: { nombre: nombre(String(e.uid)) },
				});
				break;
			case "sinBayas":
				sinBayas++;
				break;
			case "recursoPerdido":
				lineas.push({
					clave: "santuario.resumen.perdido",
					params: {
						recurso: recursoVisible(String(e.recurso)),
						n: Number(e.cantidad),
					},
				});
				break;
			case "visitanteLlega":
				lineas.push({
					clave: "santuario.resumen.visitanteLlega",
					params: { especie: String(e.especie) },
				});
				break;
			case "visitanteSeQueda":
				lineas.push({
					clave: "santuario.resumen.visitanteSeQueda",
					params: { nombre: nombre(String(e.uid)) },
				});
				break;
			case "visitanteSeVa":
				lineas.push({
					clave: "santuario.resumen.visitanteSeVa",
					params: { nombre: nombre(String(e.uid)), motivo: String(e.motivo) },
				});
				break;
			case "residenteNuevo":
				lineas.push({
					clave: "santuario.resumen.residenteNuevo",
					params: { especie: String(e.especie) },
				});
				break;
			case "terrenoCambiado":
				terreno++;
				break;
		}
	}
	if (sinBayas > 0)
		lineas.push({
			clave: "santuario.resumen.sinBayas",
			params: { n: sinBayas },
		});
	if (terreno > 0)
		lineas.push({ clave: "santuario.resumen.terreno", params: { n: terreno } });
	return lineas;
}
