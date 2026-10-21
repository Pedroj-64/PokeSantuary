import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	AprendizajeSchema,
	type Elites,
	ElitesSchema,
	EspecieSchema,
	EventosSchema,
	type Evoluciones,
	EvolucionesSchema,
	ExpedicionBalanceSchema,
	ManifiestoSchema,
	type Movimiento,
	MovimientoSchema,
	OficialSchema,
	SetCombateSchema,
	TrabajosPorTipoSchema,
} from "@santuario/data";
import { z } from "zod";
import { aprendizajePorNivel, conAtaqueMinimo } from "./aprendizaje.js";
import { archivosDelPack } from "./construir.js";
import { evolucionesDe, nivelEtapa } from "./evolucion.js";
import { resolverEnPack, sha256 } from "./manifiesto.js";
import { erroresDeSets, unirMovimiento } from "./movimientos.js";
import { oficialesVersionados } from "./oficial.js";
import { especiesPkmn } from "./unir.js";

const leer = (dir: string, f: string) =>
	JSON.parse(readFileSync(join(dir, f), "utf8"));

/** Archivos que git versiona; sin repositorio (p. ej. un tarball) no hay nada que comprobar. */
function listarVersionados(): string[] {
	try {
		return execFileSync("git", ["ls-files"], {
			cwd: fileURLToPath(new URL("../../..", import.meta.url)),
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		})
			.split("\n")
			.filter(Boolean);
	} catch {
		return [];
	}
}

// Revisa el pack sin red. Devuelve la lista de errores (vacía si todo está bien).
export async function verificar(
	dirPack: string,
	listaMovimientos = fileURLToPath(
		new URL("../movimientos.json", import.meta.url),
	),
	archivosVersionados = listarVersionados,
): Promise<string[]> {
	const errores: string[] = [];
	const intentar = async (f: () => void | Promise<void>) => {
		try {
			await f();
		} catch (e) {
			errores.push(e instanceof Error ? e.message : String(e));
		}
	};

	let archivos: Record<string, string> = {};
	await intentar(() => {
		archivos = ManifiestoSchema.parse(leer(dirPack, "manifest.json")).archivos;
	});
	for (const [clave, esperado] of Object.entries(archivos)) {
		await intentar(() => {
			const ruta = resolverEnPack(dirPack, clave);
			if (!existsSync(ruta)) throw new Error(`${clave}: no existe`);
			if (sha256(ruta) !== esperado)
				throw new Error(`${clave}: hash distinto al del manifiesto`);
		});
	}
	await intentar(() => {
		for (const f of archivosDelPack(dirPack))
			if (!(f in archivos)) throw new Error(`${f}: no está en el manifiesto`);
	});
	await intentar(() => {
		TrabajosPorTipoSchema.parse(leer(dirPack, "trabajos.json"));
	});
	let especies: string[] = [];
	let movs: Movimiento[] = [];
	await intentar(() => {
		const lista = z.array(EspecieSchema).parse(leer(dirPack, "especies.json"));
		especies = lista.map((e) => e.id);
		const vistos = new Set<string>();
		for (const e of lista) {
			if (vistos.has(e.id)) throw new Error(`${e.id}: especie repetida`);
			vistos.add(e.id);
			if (!especiesPkmn.get(e.id)?.exists)
				throw new Error(`${e.id}: no existe en @pkmn/data`);
		}
	});
	await intentar(() => {
		const oficial = OficialSchema.parse(leer(dirPack, "oficial.json"));
		for (const especie of especies)
			if (!oficial.sprites[especie])
				errores.push(`oficial.json: falta ${especie}`);
		for (const especie of Object.keys(oficial.sprites))
			if (!especies.includes(especie))
				errores.push(`oficial.json: ${especie} no está en especies.json`);
	});
	await intentar(() => {
		const versionados = oficialesVersionados(archivosVersionados());
		for (const f of versionados)
			errores.push(`${f}: asset oficial versionado en git (regla 4.2.4)`);
	});
	await intentar(() => {
		const lista = z
			.array(MovimientoSchema)
			.parse(leer(dirPack, "movimientos.json"));
		movs = lista;
		const vistos = new Set<string>();
		for (const m of lista) {
			if (vistos.has(m.id)) throw new Error(`${m.id}: movimiento repetido`);
			vistos.add(m.id);
		}
		for (const m of lista)
			if (JSON.stringify(unirMovimiento(m)) !== JSON.stringify(m))
				throw new Error(`${m.id}: difiere de @pkmn/data`);
	});
	await intentar(async () => {
		if (!existsSync(join(dirPack, "aprendizaje.json")))
			throw new Error("aprendizaje.json: no existe");
		const resultado = AprendizajeSchema.safeParse(
			leer(dirPack, "aprendizaje.json"),
		);
		if (!resultado.success)
			throw new Error(`aprendizaje.json: ${resultado.error.message}`);
		const aprendizaje = resultado.data;
		for (const especie of especies)
			if (!(especie in aprendizaje))
				errores.push(`aprendizaje.json: falta ${especie}`);
		const ids = new Set(movs.map((m) => m.id));
		const setsDelPack = z
			.array(SetCombateSchema)
			.parse(leer(dirPack, "sets.json"));
		for (const [especie, entradas] of Object.entries(aprendizaje)) {
			if (!especies.includes(especie))
				errores.push(`aprendizaje.json: ${especie} no está en especies.json`);
			for (const entrada of entradas)
				if (!ids.has(entrada.movimiento))
					errores.push(
						`aprendizaje.json: ${especie}: ${entrada.movimiento} no está en movimientos.json`,
					);
			let esperado: { nivel: number; movimiento: string }[];
			try {
				const bruto = await aprendizajePorNivel(especie);
				// La misma regla del generador: sin ataques, entra el primero del set.
				esperado =
					conAtaqueMinimo({ [especie]: bruto }, setsDelPack, movs).aprendizaje[
						especie
					] ?? bruto;
			} catch (e) {
				errores.push(
					`aprendizaje.json: ${especie}: ${e instanceof Error ? e.message : String(e)}`,
				);
				continue;
			}
			if (JSON.stringify(esperado) !== JSON.stringify(entradas))
				errores.push(
					`aprendizaje.json: ${especie}: no coincide con @pkmn/data`,
				);
		}
	});
	await intentar(async () => {
		if (!existsSync(join(dirPack, "evoluciones.json")))
			throw new Error("evoluciones.json: no existe");
		const resultado = EvolucionesSchema.safeParse(
			leer(dirPack, "evoluciones.json"),
		);
		if (!resultado.success)
			throw new Error(`evoluciones.json: ${resultado.error.message}`);
		const evoluciones: Evoluciones = resultado.data;
		for (const especie of especies)
			if (!(especie in evoluciones))
				errores.push(`evoluciones.json: falta ${especie}`);
		for (const [especie, entrada] of Object.entries(evoluciones)) {
			if (!especies.includes(especie))
				errores.push(`evoluciones.json: ${especie} no está en especies.json`);
			let esperado: { nivelEtapa: number; evoluciones: unknown[] };
			try {
				esperado = {
					nivelEtapa: nivelEtapa(especie),
					evoluciones: evolucionesDe(especie),
				};
			} catch (e) {
				errores.push(
					`evoluciones.json: ${especie}: ${e instanceof Error ? e.message : String(e)}`,
				);
				continue;
			}
			if (
				entrada.nivelEtapa !== esperado.nivelEtapa ||
				JSON.stringify(entrada.evoluciones) !==
					JSON.stringify(esperado.evoluciones)
			)
				errores.push(
					`evoluciones.json: ${especie}: no coincide con @pkmn/data`,
				);
		}
	});
	await intentar(async () => {
		const sets = z.array(SetCombateSchema).parse(leer(dirPack, "sets.json"));
		errores.push(
			...(await erroresDeSets(sets, { movimientos: movs, especies })),
		);
		const lista: string[] = JSON.parse(readFileSync(listaMovimientos, "utf8"));
		for (const s of sets)
			for (const m of s.movimientos)
				if (!lista.includes(m))
					errores.push(
						`set de ${s.especie}: ${m} no está en tools/pipeline/movimientos.json`,
					);
	});
	await intentar(() => {
		const balance = ExpedicionBalanceSchema.parse(
			leer(dirPack, "expedicion.json"),
		);
		for (const id of Object.keys(balance.tasaCaptura))
			if (!especies.includes(id))
				throw new Error(
					`expedicion.json: tasaCaptura de ${id}, que no está en especies.json`,
				);
	});
	await intentar(() => {
		try {
			EventosSchema.parse(leer(dirPack, "eventos.json"));
		} catch (e) {
			throw new Error(
				`eventos.json: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	});
	await intentar(async () => {
		let elites: Elites;
		try {
			elites = ElitesSchema.parse(leer(dirPack, "elites.json"));
		} catch (e) {
			throw new Error(
				`elites.json: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
		const conPrefijo = (lista: string[]) =>
			lista.map((e) => `elites.json: ${e}`);
		const alfas = await erroresDeSets(elites.alfas, {
			movimientos: movs,
			especies,
		});
		errores.push(...conPrefijo(alfas));
		const enAlfas = new Set(elites.alfas.map((s) => s.especie));
		for (const e of especies)
			if (!enAlfas.has(e))
				errores.push(`elites.json: ${e}: falta su set de Alfa`);
		for (const s of elites.jefe.equipo) {
			if (!especies.includes(s.especie))
				errores.push(
					`elites.json: ${s.especie}: la especie no está en especies.json`,
				);
			// La cobertura de especies se comprueba aparte, con los Alfa.
			errores.push(
				...conPrefijo(
					await erroresDeSets([s], {
						movimientos: movs,
						especies: [s.especie],
					}),
				),
			);
		}
		const lista: string[] = JSON.parse(readFileSync(listaMovimientos, "utf8"));
		for (const s of [...elites.alfas, ...elites.jefe.equipo])
			for (const m of s.movimientos)
				if (!lista.includes(m))
					errores.push(
						`elites.json: set de ${s.especie}: ${m} no está en tools/pipeline/movimientos.json`,
					);
	});
	return errores;
}
