import balanceCrudo from "@packs/kanto/expedicion.json?raw";
import {
	type ExpedicionBalance,
	ExpedicionBalanceSchema,
} from "@santuario/data";

/** Balance de la expedición del pack kanto; lanza si el JSON no valida. */
export const cargarBalance = (): ExpedicionBalance =>
	ExpedicionBalanceSchema.parse(JSON.parse(balanceCrudo));
