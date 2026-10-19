import especiesCrudas from "@packs/kanto/especies.json";
import type { Especie } from "@santuario/data";
import { idiomaActual } from "../i18n/index.js";

const especies = especiesCrudas as unknown as Especie[];

/** Nombre visible de una especie en el idioma actual; si el pack no la conoce, su id. */
export const nombreDeEspecie = (slug: string): string =>
	especies.find((e) => e.id === slug)?.nombre[idiomaActual()] ?? slug;
