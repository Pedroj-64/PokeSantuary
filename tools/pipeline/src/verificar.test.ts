import {
	cpSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Movimiento, Oficial } from "@santuario/data";
import { describe, expect, it } from "vitest";
import { aprendizajePorNivel, conAtaqueMinimo } from "./aprendizaje.js";
import { evolucionesDe, nivelEtapa } from "./evolucion.js";
import { sha256 } from "./manifiesto.js";
import {
	type MovimientoApi,
	recortarMovimiento,
	unirMovimiento,
} from "./movimientos.js";
import { gen9 } from "./unir.js";
import { verificar } from "./verificar.js";

const PACK_REAL = fileURLToPath(
	new URL("../../../packs/kanto", import.meta.url),
);

const ESPECIES_PACK: string[] = (
	JSON.parse(readFileSync(join(PACK_REAL, "especies.json"), "utf8")) as {
		id: string;
	}[]
).map((e) => e.id);

// El pack real todavía no trae aprendizaje.json ni los movimientos que se
// aprenden (los genera `pnpm data:build`); la copia temporal los sintetiza con
// el mismo canal para probar verificar.

/** Respuesta de PokeAPI `move/{slug}` mínima, derivada de @pkmn/data. */
const recorte = (id: string): MovimientoApi => {
	const m = gen9.moves.get(id);
	if (!m?.exists) throw new Error(`${id}: no existe en @pkmn/data`);
	return {
		name: id,
		type: { name: m.type.toLowerCase() },
		damage_class: { name: m.category.toLowerCase() },
		power: m.basePower > 0 ? m.basePower : null,
		accuracy: m.accuracy === true ? null : m.accuracy,
		pp: m.pp,
		names: [
			{ language: { name: "es" }, name: m.name },
			{ language: { name: "en" }, name: m.name },
		],
	};
};

const MOVIMIENTOS_PACK: Movimiento[] = JSON.parse(
	readFileSync(join(PACK_REAL, "movimientos.json"), "utf8"),
);
const idsPack = new Set(MOVIMIENTOS_PACK.map((m) => m.id));
for (const slug of JSON.parse(
	readFileSync(
		fileURLToPath(new URL("../movimientos.json", import.meta.url)),
		"utf8",
	),
) as string[]) {
	if (!idsPack.has(slug))
		MOVIMIENTOS_PACK.push(unirMovimiento(recortarMovimiento(recorte(slug))));
}
const MOVIMIENTOS_TEXTO = `${JSON.stringify(MOVIMIENTOS_PACK, null, "\t")}\n`;

// Mismo canal que `data:build`: @pkmn/data más el ataque mínimo de quien no tiene ninguno.
const APRENDIZAJE_BRUTO: Record<
	string,
	{ nivel: number; movimiento: string }[]
> = {};
for (const especie of [...ESPECIES_PACK].sort())
	APRENDIZAJE_BRUTO[especie] = await aprendizajePorNivel(especie);
const APRENDIZAJE = conAtaqueMinimo(
	APRENDIZAJE_BRUTO,
	JSON.parse(readFileSync(join(PACK_REAL, "sets.json"), "utf8")),
	MOVIMIENTOS_PACK,
).aprendizaje;
const APRENDIZAJE_TEXTO = `${JSON.stringify(APRENDIZAJE, null, "\t")}\n`;

const EVOLUCIONES: Record<
	string,
	{ nivelEtapa: number; evoluciones: ReturnType<typeof evolucionesDe> }
> = {};
for (const especie of [...ESPECIES_PACK].sort())
	EVOLUCIONES[especie] = {
		nivelEtapa: nivelEtapa(especie),
		evoluciones: evolucionesDe(especie),
	};
const EVOLUCIONES_TEXTO = `${JSON.stringify(EVOLUCIONES, null, "\t")}\n`;

const copia = () => {
	const dir = mkdtempSync(join(tmpdir(), "pack-"));
	cpSync(PACK_REAL, dir, { recursive: true });
	writeFileSync(join(dir, "aprendizaje.json"), APRENDIZAJE_TEXTO);
	writeFileSync(join(dir, "evoluciones.json"), EVOLUCIONES_TEXTO);
	writeFileSync(join(dir, "movimientos.json"), MOVIMIENTOS_TEXTO);
	const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
	for (const f of ["aprendizaje.json", "evoluciones.json", "movimientos.json"])
		m.archivos[f] = sha256(join(dir, f));
	writeFileSync(join(dir, "manifest.json"), JSON.stringify(m));
	return dir;
};

// Reescribe el manifiesto para que solo falle lo que se manipuló.
const resellar = (dir: string) => {
	const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
	for (const f of Object.keys(m.archivos)) m.archivos[f] = sha256(join(dir, f));
	writeFileSync(join(dir, "manifest.json"), JSON.stringify(m));
};

type Fila = { especie: string; movimientos: string[] };

describe("verificar", () => {
	it("acepta el pack tal como está", async () => {
		expect(await verificar(copia())).toEqual([]);
	});

	it("falla si se altera un byte de especies.json", async () => {
		const dir = copia();
		const ruta = join(dir, "especies.json");
		const texto = readFileSync(ruta, "utf8");
		writeFileSync(ruta, texto.replace("Pikachu", "Pikachu "));
		expect((await verificar(dir)).join("\n")).toMatch(/especies\.json.*hash/);
	});

	it("falla si una especie no existe en @pkmn/data", async () => {
		const dir = copia();
		const ruta = join(dir, "especies.json");
		const especies = JSON.parse(readFileSync(ruta, "utf8"));
		especies[0].id = "noexiste";
		writeFileSync(ruta, JSON.stringify(especies));
		expect((await verificar(dir)).join("\n")).toMatch(
			/noexiste: no existe en @pkmn/,
		);
	});

	it("rechaza claves del manifiesto que escapan del pack o con byte nulo", async () => {
		for (const clave of ["../especies.json", "a\0b.json", "/etc/passwd"]) {
			const dir = copia();
			const hash = "0".repeat(64);
			writeFileSync(
				join(dir, "manifest.json"),
				JSON.stringify({ archivos: { [clave]: hash } }),
			);
			expect((await verificar(dir)).length).toBeGreaterThan(0);
		}
	});

	it("falla si hay un archivo del pack que el manifiesto no declara", async () => {
		const dir = copia();
		writeFileSync(join(dir, "extra.json"), "{}");
		expect((await verificar(dir)).join("\n")).toMatch(/extra\.json/);
	});
	describe("sets y movimientos", () => {
		const editar = (archivo: string, f: (d: Fila[]) => void) => {
			const dir = copia();
			const ruta = join(dir, archivo);
			const datos = JSON.parse(readFileSync(ruta, "utf8"));
			f(datos);
			writeFileSync(ruta, JSON.stringify(datos));
			return dir;
		};

		it("falla si un set referencia un movimiento ausente de movimientos.json", async () => {
			const dir = editar("movimientos.json", (m) => {
				m.splice(0, m.length);
			});
			expect((await verificar(dir)).join("\n")).toMatch(
				/no está en movimientos\.json/,
			);
		});

		it("falla si un movimiento no existe en @pkmn/data", async () => {
			const dir = editar("sets.json", (s) => {
				(s[0] as Fila).movimientos[0] = "noexiste";
			});
			expect((await verificar(dir)).join("\n")).toMatch(
				/noexiste.*no existe en @pkmn/,
			);
		});

		it("falla si la especie no puede aprender el movimiento", async () => {
			const dir = editar("sets.json", (s) => {
				(s[0] as Fila).movimientos[0] = "thunderbolt";
			});
			expect((await verificar(dir)).join("\n")).toMatch(
				/no puede aprender thunderbolt/,
			);
		});

		it("falla si la especie del set no está en especies.json", async () => {
			const dir = editar("sets.json", (s) => {
				(s[0] as Fila).especie = "mew";
			});
			expect((await verificar(dir)).join("\n")).toMatch(/mew.*especies\.json/);
		});

		it("falla si sets.json o movimientos.json se alteran sin actualizar el manifiesto", async () => {
			for (const f of ["sets.json", "movimientos.json"]) {
				const dir = copia();
				writeFileSync(join(dir, f), `${readFileSync(join(dir, f), "utf8")} `);
				expect((await verificar(dir)).join("\n")).toMatch(
					new RegExp(`${f.replace(".", "\\.")}.*hash`),
				);
			}
		});

		it("falla si falta sets.json en el manifiesto", async () => {
			const dir = copia();
			const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
			delete m.archivos["sets.json"];
			writeFileSync(join(dir, "manifest.json"), JSON.stringify(m));
			expect((await verificar(dir)).join("\n")).toMatch(
				/sets\.json: no está en el manifiesto/,
			);
		});

		it("falla si movimientos.json repite un id", async () => {
			const dir = copia();
			const ruta = join(dir, "movimientos.json");
			const m = JSON.parse(readFileSync(ruta, "utf8"));
			m.push(m[0]);
			writeFileSync(ruta, JSON.stringify(m));
			expect((await verificar(dir)).join("\n")).toMatch(/movimiento repetido/);
		});

		it("falla si un movimiento de un set falta en la lista del pipeline", async () => {
			const lista = join(mkdtempSync(join(tmpdir(), "lista-")), "m.json");
			writeFileSync(lista, "[]");
			expect((await verificar(copia(), lista)).join("\n")).toMatch(
				/no está en tools\/pipeline\/movimientos\.json/,
			);
		});
	});

	describe("aprendizaje.json", () => {
		type Niveles = Record<string, { nivel: number; movimiento: string }[]>;
		const editar = (cambio: (a: Niveles) => void) => {
			const dir = copia();
			const ruta = join(dir, "aprendizaje.json");
			const a = JSON.parse(readFileSync(ruta, "utf8")) as Niveles;
			cambio(a);
			writeFileSync(ruta, JSON.stringify(a));
			resellar(dir);
			return dir;
		};

		it("falla si falta una especie", async () => {
			const dir = editar((a) => delete a.charmander);
			expect((await verificar(dir)).join("\n")).toMatch(
				/aprendizaje\.json: falta charmander/,
			);
		});

		it("falla si sobra una especie", async () => {
			const dir = editar((a) => {
				a.mew = [{ nivel: 1, movimiento: "pound" }];
			});
			expect((await verificar(dir)).join("\n")).toMatch(
				/aprendizaje\.json: mew no está en especies\.json/,
			);
		});

		it("falla si un movimiento no está en movimientos.json del pack", async () => {
			const dir = editar((a) => {
				const lista = a.charmander;
				if (!lista) throw new Error("el pack no trae charmander");
				lista[0] = { nivel: 1, movimiento: "pound" };
			});
			expect((await verificar(dir)).join("\n")).toMatch(
				/aprendizaje\.json: charmander: pound no está en movimientos\.json/,
			);
		});

		it("falla si se altera una entrada a mano", async () => {
			const dir = editar((a) => {
				const lista = a.charmander;
				const entrada = lista?.[2];
				if (!lista || !entrada)
					throw new Error("el pack no trae la tercera entrada");
				lista[2] = { ...entrada, nivel: 5 };
			});
			expect((await verificar(dir)).join("\n")).toMatch(
				/aprendizaje\.json: charmander: no coincide con @pkmn\/data/,
			);
		});

		it("falla si falta en el pack", async () => {
			const dir = copia();
			rmSync(join(dir, "aprendizaje.json"));
			expect((await verificar(dir)).join("\n")).toMatch(
				/aprendizaje\.json: no existe/,
			);
		});
	});

	describe("evoluciones.json", () => {
		type EvolucionesCrudas = Record<
			string,
			{
				nivelEtapa: number;
				evoluciones: { a: string; condicion: Record<string, unknown> }[];
			}
		>;
		const editar = (cambio: (e: EvolucionesCrudas) => void) => {
			const dir = copia();
			const ruta = join(dir, "evoluciones.json");
			const e = JSON.parse(readFileSync(ruta, "utf8")) as EvolucionesCrudas;
			cambio(e);
			writeFileSync(ruta, JSON.stringify(e));
			resellar(dir);
			return dir;
		};

		it("falla si falta una especie", async () => {
			const dir = editar((e) => delete e.charmander);
			expect((await verificar(dir)).join("\n")).toMatch(
				/evoluciones\.json: falta charmander/,
			);
		});

		it("falla si sobra una especie", async () => {
			const dir = editar((e) => {
				e.mew = { nivelEtapa: 0, evoluciones: [] };
			});
			expect((await verificar(dir)).join("\n")).toMatch(
				/evoluciones\.json: mew no está en especies\.json/,
			);
		});

		it("falla si se altera una entrada a mano", async () => {
			const dir = editar((e) => {
				const lista = e.charmander?.evoluciones;
				const entrada = lista?.[0];
				if (!lista || !entrada)
					throw new Error("el pack no trae la evolución de charmander");
				lista[0] = { ...entrada, condicion: { tipo: "nivel", nivel: 20 } };
			});
			expect((await verificar(dir)).join("\n")).toMatch(
				/evoluciones\.json: charmander: no coincide con @pkmn\/data/,
			);
		});

		it("falla si falta en el pack", async () => {
			const dir = copia();
			rmSync(join(dir, "evoluciones.json"));
			expect((await verificar(dir)).join("\n")).toMatch(
				/evoluciones\.json: no existe/,
			);
		});
	});

	describe("expedicion.json", () => {
		const alterar = (cambio: (balance: Record<string, unknown>) => void) => {
			const dir = copia();
			const ruta = join(dir, "expedicion.json");
			const balance = JSON.parse(readFileSync(ruta, "utf8"));
			cambio(balance);
			writeFileSync(ruta, JSON.stringify(balance));
			return dir;
		};

		it("falla si no cumple el esquema", async () => {
			const dir = alterar((b) => {
				b.dineroInicial = -1;
			});
			expect((await verificar(dir)).join("\n")).toMatch(/dineroInicial/);
		});

		it("falla si una tasa de captura es de una especie que no está en especies.json", async () => {
			const dir = alterar((b) => {
				(b.tasaCaptura as Record<string, number>).mew = 45;
			});
			expect((await verificar(dir)).join("\n")).toMatch(
				/expedicion\.json: tasaCaptura de mew/,
			);
		});

		it("falla si falta en el pack", async () => {
			const dir = copia();
			rmSync(join(dir, "expedicion.json"));
			expect((await verificar(dir)).join("\n")).toMatch(/expedicion\.json/);
		});
	});

	describe("eventos.json", () => {
		it("falla si no cumple el esquema", async () => {
			const dir = copia();
			const ruta = join(dir, "eventos.json");
			const eventos = JSON.parse(readFileSync(ruta, "utf8"));
			eventos.pop();
			eventos.push({ id: "roto" });
			writeFileSync(ruta, JSON.stringify(eventos));
			expect((await verificar(dir)).join("\n")).toMatch(/eventos\.json/);
		});

		it("falla si falta en el pack", async () => {
			const dir = copia();
			rmSync(join(dir, "eventos.json"));
			expect((await verificar(dir)).join("\n")).toMatch(/eventos\.json/);
		});
	});

	describe("elites.json", () => {
		const editar = (cambio: (elites: Fila[]) => void) => {
			const dir = copia();
			const ruta = join(dir, "elites.json");
			const elites = JSON.parse(readFileSync(ruta, "utf8"));
			cambio(elites.alfas);
			writeFileSync(ruta, JSON.stringify(elites));
			resellar(dir);
			return dir;
		};

		it("falla si una especie del pack no tiene Alfa", async () => {
			const dir = editar((alfas) => {
				const i = alfas.findIndex((s) => s.especie === "pikachu");
				alfas.splice(i, 1);
			});
			expect((await verificar(dir)).join("\n")).toMatch(
				/elites\.json: pikachu: falta su set de Alfa/,
			);
		});

		it("falla si un movimiento de un Alfa no está en la lista del pipeline", async () => {
			const lista = join(mkdtempSync(join(tmpdir(), "lista-")), "m.json");
			writeFileSync(lista, "[]");
			expect((await verificar(copia(), lista)).join("\n")).toMatch(
				/elites\.json: set de .* no está en tools\/pipeline\/movimientos\.json/,
			);
		});

		it("falla si el equipo del jefe no tiene tres miembros", async () => {
			const dir = copia();
			const ruta = join(dir, "elites.json");
			const elites = JSON.parse(readFileSync(ruta, "utf8"));
			elites.jefe.equipo.pop();
			writeFileSync(ruta, JSON.stringify(elites));
			resellar(dir);
			expect((await verificar(dir)).join("\n")).toMatch(/elites\.json/);
		});

		it("falla si una especie del jefe no está en el pack", async () => {
			const dir = copia();
			const ruta = join(dir, "elites.json");
			const elites = JSON.parse(readFileSync(ruta, "utf8"));
			elites.jefe.equipo[0].especie = "mew";
			writeFileSync(ruta, JSON.stringify(elites));
			resellar(dir);
			expect((await verificar(dir)).join("\n")).toMatch(
				/elites\.json: mew: la especie no está en especies\.json/,
			);
		});

		it("falla si falta en el pack", async () => {
			const dir = copia();
			rmSync(join(dir, "elites.json"));
			expect((await verificar(dir)).join("\n")).toMatch(/elites\.json/);
		});
	});

	describe("assets oficiales", () => {
		const editarOficial = (dir: string, f: (o: Oficial) => void) => {
			const ruta = join(dir, "oficial.json");
			const o = JSON.parse(readFileSync(ruta, "utf8"));
			f(o);
			writeFileSync(ruta, JSON.stringify(o));
			resellar(dir);
		};

		it("oficial.json cubre las 10 especies con dos URL cada una", () => {
			const o = JSON.parse(
				readFileSync(join(PACK_REAL, "oficial.json"), "utf8"),
			);
			expect(Object.keys(o.sprites)).toHaveLength(10);
			expect(o.sprites.pikachu.frente).toMatch(/^https:\/\/raw\.github/);
			expect(o.sprites.zubat.espalda).toMatch(/\/back\/\d+\.png$/);
		});

		it("falla si falta una especie en oficial.json", async () => {
			const dir = copia();
			editarOficial(dir, (o) => delete o.sprites.eevee);
			expect((await verificar(dir)).join("\n")).toMatch(
				/oficial\.json: falta eevee/,
			);
		});

		it("falla si oficial.json trae una especie que no está en el pack", async () => {
			const dir = copia();
			editarOficial(dir, (o) => {
				o.sprites.mew = o.sprites.abra as Oficial["sprites"][string];
			});
			expect((await verificar(dir)).join("\n")).toMatch(
				/oficial\.json: mew no está en especies\.json/,
			);
		});

		it("falla con una URL fuera de PokeAPI/sprites", async () => {
			const dir = copia();
			editarOficial(dir, (o) => {
				(o.sprites.abra as { frente: string }).frente =
					"https://evil.example/x.png";
			});
			expect((await verificar(dir)).join("\n")).toMatch(
				/URL de sprite no permitida/,
			);
		});

		it("falla si git versiona un asset oficial", async () => {
			const errores = await verificar(copia(), undefined, () => [
				"packs/kanto/atlas-combate.png",
				"oficial/o2/golpe.wav",
				"packs/kanto/oficial.json",
			]);
			expect(errores.join("\n")).toMatch(
				/atlas-combate\.png: asset oficial versionado/,
			);
			expect(errores.join("\n")).toMatch(/golpe\.wav: asset oficial/);
			expect(errores.join("\n")).not.toMatch(/oficial\.json: asset/);
		});

		it("el repositorio real no versiona ningún asset oficial", async () => {
			expect(await verificar(copia())).toEqual([]);
		});
	});
});
