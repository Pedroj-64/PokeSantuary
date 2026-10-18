import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	ElitesSchema,
	EventosSchema,
	ExpedicionBalanceSchema,
	SetCombateSchema,
} from "@santuario/data";
import { z } from "zod";
import type { DatosSimulacion } from "./simular.js";

const pack = (f: string): unknown =>
	JSON.parse(
		readFileSync(
			fileURLToPath(new URL(`../../../packs/kanto/${f}`, import.meta.url)),
			"utf8",
		),
	);

/** Datos del pack kanto tal como los usa el juego; lanza si no validan. */
export function cargarDatosPack(): DatosSimulacion {
	return {
		sets: z.array(SetCombateSchema).parse(pack("sets.json")),
		balance: ExpedicionBalanceSchema.parse(pack("expedicion.json")),
		eventos: EventosSchema.parse(pack("eventos.json")),
		elites: ElitesSchema.parse(pack("elites.json")),
	};
}
