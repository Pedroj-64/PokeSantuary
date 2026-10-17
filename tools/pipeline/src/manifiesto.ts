import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export const sha256 = (ruta: string) =>
	createHash("sha256").update(readFileSync(ruta)).digest("hex");

// Resuelve una clave del manifiesto dentro del pack; lanza si escapa de él.
export function resolverEnPack(dirPack: string, clave: string): string {
	if (clave.includes("\0")) throw new Error("ruta con byte nulo");
	const base = resolve(dirPack);
	const ruta = resolve(base, clave);
	const rel = relative(base, ruta);
	if (
		isAbsolute(clave) ||
		rel === "" ||
		rel.startsWith("..") ||
		isAbsolute(rel)
	)
		throw new Error(`ruta fuera del pack: ${clave}`);
	return join(base, rel);
}
