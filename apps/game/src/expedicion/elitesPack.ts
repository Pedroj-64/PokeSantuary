import elitesCrudo from "@packs/kanto/elites.json?raw";
import { type Elites, ElitesSchema } from "@santuario/data";

/** Alfa y jefe del pack kanto; lanza si el JSON no valida. */
export const cargarElites = (): Elites =>
	ElitesSchema.parse(JSON.parse(elitesCrudo));
