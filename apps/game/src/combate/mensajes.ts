import type { EventoCombate } from "@santuario/battle";
import { t } from "../i18n/index.js";

/** Nombres visibles según el idioma activo; los eventos solo llevan slugs. */
export interface NombresVisibles {
	especie(slug: string): string;
	movimiento(slug: string): string;
}

/**
 * Texto de un evento en el idioma activo. Devuelve cadena vacía cuando el
 * evento no se cuenta con palabras (`turno`, `dano`: la barra de PS ya lo muestra).
 */
export function mensajeDe(e: EventoCombate, datos: NombresVisibles): string {
	switch (e.tipo) {
		case "inicio":
			return t("msg.inicio");
		case "turno":
		case "dano":
			return "";
		case "movimiento":
			return t(`msg.movimiento.${e.lado}`, {
				especie: datos.especie(e.especie),
				movimiento: datos.movimiento(e.movimiento),
			});
		case "curacion":
			return t(`msg.curacion.${e.lado}`);
		case "efectividad":
			return t(`msg.efectividad.${e.valor}`);
		case "critico":
			return t("msg.critico");
		case "fallo":
			return t("msg.fallo");
		case "debilitado":
			return t(`msg.debilitado.${e.lado}`, {
				especie: datos.especie(e.especie),
			});
		case "cambio":
			return t(`msg.cambio.${e.lado}`, { especie: datos.especie(e.especie) });
		case "fin":
			return t(`msg.fin.${e.ganador}`);
	}
}
