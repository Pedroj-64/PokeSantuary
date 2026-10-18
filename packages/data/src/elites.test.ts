import { describe, expect, it } from "vitest";
import { ElitesSchema, JefeSchema } from "./elites.js";

// Este paquete no trae `@types/node`, así que el módulo se carga por su nombre
// y se declara aquí el único tipo que se usa.
const { readFileSync } = (await import("node:fs" as string)) as {
	readFileSync: (ruta: URL, codificacion: "utf8") => string;
};

/** JSON real del pack, tal cual está en el repositorio. */
const LEIDO: unknown = JSON.parse(
	readFileSync(
		new URL("../../../packs/kanto/elites.json", import.meta.url),
		"utf8",
	),
);

/** Especies del pack, para comprobar que los Alfa las cubren. */
const ESPECIES: Array<{ id: string }> = JSON.parse(
	readFileSync(
		new URL("../../../packs/kanto/especies.json", import.meta.url),
		"utf8",
	),
);

/** Forma suelta del JSON para romper una regla a la vez. */
interface Crudo {
	alfas: Array<{ especie: string; [k: string]: unknown }>;
	jefe: {
		nombre: string;
		equipo: Array<{ especie: string; [k: string]: unknown }>;
		[k: string]: unknown;
	};
	[k: string]: unknown;
}

/** Copia independiente del pack. */
const base = (): Crudo => structuredClone(LEIDO) as Crudo;

/** Valida una copia del pack con una mutación aplicada. */
const roto = (romper: (crudo: Crudo) => void): boolean => {
	const crudo = base();
	romper(crudo);
	return ElitesSchema.safeParse(crudo).success;
};

/** Equipo del jefe del pack; falla si no se puede leer. */
const equipoJefe = (crudo: Crudo) => {
	const equipo = crudo.jefe.equipo;
	if (equipo.length === 0) throw new Error("el pack no trae equipo de jefe");
	return equipo;
};

describe("ElitesSchema", () => {
	it("acepta el JSON real del pack", () => {
		const resultado = ElitesSchema.safeParse(LEIDO);
		expect(resultado.success ? [] : resultado.error.issues).toEqual([]);
	});

	it("el pack trae un Alfa por cada especie, sin repetir", () => {
		const elites = ElitesSchema.parse(LEIDO);
		const alfas = elites.alfas.map((s) => s.especie);
		expect(new Set(alfas).size).toBe(alfas.length);
		expect([...alfas].sort()).toEqual(ESPECIES.map((e) => e.id).sort());
	});

	it("el jefe trae tres especies distintas y una clave de nombre", () => {
		const elites = ElitesSchema.parse(LEIDO);
		const equipo = elites.jefe.equipo.map((s) => s.especie);
		expect(equipo).toHaveLength(3);
		expect(new Set(equipo).size).toBe(3);
		expect(elites.jefe.nombre).toBe("jefe.verdemar.nombre");
	});

	it("rechaza especie repetida en los Alfa", () => {
		expect(
			roto((crudo) => {
				const primero = crudo.alfas[0];
				const segundo = crudo.alfas[1];
				if (!primero || !segundo) throw new Error("faltan Alfa");
				segundo.especie = primero.especie;
			}),
		).toBe(false);
	});

	it("rechaza una lista de Alfa vacía", () => {
		expect(roto((crudo) => (crudo.alfas = []))).toBe(false);
	});

	it("rechaza un equipo del jefe de 2 o 4 miembros", () => {
		expect(roto((crudo) => equipoJefe(crudo).pop())).toBe(false);
		expect(
			roto((crudo) => {
				const equipo = equipoJefe(crudo);
				const primero = equipo[0];
				if (!primero) throw new Error("el jefe no trae equipo");
				equipo.push(structuredClone(primero));
			}),
		).toBe(false);
	});

	it("rechaza especie repetida en el equipo del jefe", () => {
		expect(
			roto((crudo) => {
				const equipo = equipoJefe(crudo);
				const primero = equipo[0];
				const segundo = equipo[1];
				if (!primero || !segundo) throw new Error("faltan miembros");
				segundo.especie = primero.especie;
			}),
		).toBe(false);
	});

	it("rechaza un nombre con formato inválido", () => {
		for (const nombre of [
			"Guardián del Verdemar",
			"jefe..nombre",
			"",
			"jefe.Nombre",
		]) {
			expect(roto((crudo) => (crudo.jefe.nombre = nombre))).toBe(false);
		}
	});

	it("rechaza claves extra en el documento, el jefe y un set", () => {
		expect(roto((crudo) => (crudo.extra = 1))).toBe(false);
		expect(roto((crudo) => (crudo.jefe.extra = 1))).toBe(false);
		expect(
			roto((crudo) => {
				const primero = crudo.alfas[0];
				if (!primero) throw new Error("faltan Alfa");
				primero.extra = 1;
			}),
		).toBe(false);
	});

	it("JefeSchema no acepta un equipo suelto ni un nombre sin clave", () => {
		const equipo = equipoJefe(base());
		expect(
			JefeSchema.safeParse({ nombre: "jefe.verdemar.nombre", equipo }).success,
		).toBe(true);
		expect(
			JefeSchema.safeParse({
				nombre: "jefe.verdemar.nombre",
				equipo: equipo.slice(0, 2),
			}).success,
		).toBe(false);
	});
});
