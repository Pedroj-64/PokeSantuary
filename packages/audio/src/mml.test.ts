import { describe, expect, it } from "vitest";
import { compilarMml } from "./mml.js";
import { CancionSchema, type Efecto, EfectoSchema } from "./modelo.js";
import { renderizarCancion, TASA_POR_DEFECTO } from "./renderizar.js";

// Este paquete no trae `@types/node`, así que se declara lo mínimo que se usa.
const { readFileSync, readdirSync } = (await import("node:fs" as string)) as {
	readFileSync: (ruta: URL, codificacion: "utf8") => string;
	readdirSync: (ruta: URL) => string[];
};

const CABECERA = "@cancion id=prueba bpm=120\n@nombre audio.prueba.nombre\n";

/** Compila un cuerpo de una sola pista con la cabecera mínima. */
const unaPista = (cuerpo: string, extra = ""): ReturnType<typeof compilarMml> =>
	compilarMml(`${CABECERA}${extra}${cuerpo}\n`);

describe("compilarMml: notas y comandos", () => {
	it("compila notas, silencios y longitudes exactas", () => {
		const cancion = unaPista("pulso1 | o4 l16 c d e r c8");
		expect(cancion.pasos).toBe(6);
		expect(cancion.pistas[0]?.notas).toEqual([
			{ t: 0, d: 1, n: 60, v: 15 },
			{ t: 1, d: 1, n: 62, v: 15 },
			{ t: 2, d: 1, n: 64, v: 15 },
			{ t: 4, d: 2, n: 60, v: 15 },
		]);
	});

	it("admite puntillos y ligaduras que suman duraciones", () => {
		expect(unaPista("pulso1 | l8 c c8.").pistas[0]?.notas).toEqual([
			{ t: 0, d: 2, n: 60, v: 15 },
			{ t: 2, d: 3, n: 60, v: 15 },
		]);
		expect(unaPista("pulso1 | c4 & c8").pistas[0]?.notas).toEqual([
			{ t: 0, d: 6, n: 60, v: 15 },
		]);
		expect(() => unaPista("pulso1 | c4 & d4")).toThrow(/misma altura/);
	});

	it("las octavas absolutas y relativas dan la nota MIDI esperada", () => {
		expect(unaPista("pulso1 | o5 c > d < e").pistas[0]?.notas).toEqual([
			{ t: 0, d: 4, n: 72, v: 15 },
			{ t: 4, d: 4, n: 86, v: 15 },
			{ t: 8, d: 4, n: 76, v: 15 },
		]);
		expect(unaPista("pulso1 | o3 b-").pistas[0]?.notas[0]?.n).toBe(58);
	});

	it("el volumen y el ciclo @d afectan a las notas siguientes", () => {
		const notas = unaPista("pulso1 | v10 c @d0 d e").pistas[0]?.notas;
		expect(notas?.[0]).toEqual({ t: 0, d: 4, n: 60, v: 10 });
		expect(notas?.[1]).toEqual({
			t: 4,
			d: 4,
			n: 62,
			v: 10,
			ciclo: 12.5,
		});
		expect(notas?.[2]?.ciclo).toBe(12.5);
	});

	it("el deslizamiento se aplica solo a la nota siguiente", () => {
		const notas = unaPista("pulso1 | ~+3 c d ~-5 e").pistas[0]?.notas;
		expect(notas?.[0]?.desliz).toBe(3);
		expect(notas?.[1]?.desliz).toBeUndefined();
		expect(notas?.[2]?.desliz).toBe(-5);
	});

	it("compila un arpegio a una sola nota con sus semitonos", () => {
		const notas = unaPista("pulso1 | o4 (c e g)4 r").pistas[0]?.notas;
		expect(notas?.[0]).toEqual({ t: 0, d: 4, n: 60, v: 15, arp: [4, 7] });
		expect(notas).toHaveLength(1);
		expect(unaPista("pulso1 | (c e)").pistas[0]?.notas[0]?.arp).toEqual([4]);
	});

	it("compila los golpes del canal de ruido con sus duraciones", () => {
		const cancion = compilarMml(`${CABECERA}ruido corto | l16 b h o x s\n`);
		expect(cancion.pistas[0]?.ruidoCorto).toBe(true);
		expect(cancion.pistas[0]?.notas).toEqual([
			{ t: 0, d: 1, n: 0, v: 15, golpe: "bombo" },
			{ t: 1, d: 1, n: 0, v: 15, golpe: "charles" },
			{ t: 2, d: 1, n: 0, v: 15, golpe: "charlesAbierto" },
			{ t: 3, d: 1, n: 0, v: 15, golpe: "platillo" },
			{ t: 4, d: 1, n: 0, v: 15, golpe: "caja" },
		]);
	});
});

describe("compilarMml: repeticiones y compases", () => {
	it("repite y anida bloques manteniendo el orden", () => {
		const notas = unaPista("pulso1 | l16 [c [d e]2]2").pistas[0]?.notas;
		expect(notas?.map((n) => n.n)).toEqual([
			60, 62, 64, 62, 64, 60, 62, 64, 62, 64,
		]);
		expect(notas?.map((n) => n.t)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
	});

	it("comprueba que cada compás sume @compas pasos", () => {
		const cancion = unaPista("pulso1 | l16 [c d e f |]2", "@compas=4\n");
		expect(cancion.pasos).toBe(8);
		expect(() => unaPista("pulso1 | l16 [c d e |]2", "@compas=4\n")).toThrow(
			/compás 1 mide 3 pasos/,
		);
	});

	it("rechaza repeticiones fuera de 1..64 y más de tres niveles", () => {
		expect(() => unaPista("pulso1 | [c]0")).toThrow(/1 a 64/);
		expect(() => unaPista("pulso1 | [c]65")).toThrow(/1 a 64/);
		expect(() => unaPista("pulso1 | [[[[c]1]1]1]1")).toThrow(/3 niveles/);
	});
});

describe("compilarMml: cabecera y opciones", () => {
	it("lee los campos de @cancion y de la pista", () => {
		const cancion = compilarMml(
			`@cancion id=combate-salvaje bpm=150 pasosPorNegra=4 repetir=true bucle=8 swing=0.1
@nombre audio.combate-salvaje.nombre
pulso1 ciclo=25 vol=12 env=14,-2 vib=120,6,0.3 pan=-0.3 eco=120,0.25 | o4 c1
`,
		);
		expect(cancion.id).toBe("combate-salvaje");
		expect(cancion.bpm).toBe(150);
		expect(cancion.repetir).toBe(true);
		expect(cancion.bucle).toEqual({ desde: 8 });
		expect(cancion.swing).toBe(0.1);
		const pista = cancion.pistas[0];
		expect(pista?.ciclo).toBe(25);
		expect(pista?.volumen).toBe(12);
		expect(pista?.envolvente).toEqual({ inicio: 14, paso: -2 });
		expect(pista?.vibrato).toEqual({ retardoMs: 120, hz: 6, profundidad: 0.3 });
		expect(pista?.pan).toBe(-0.3);
		expect(pista?.eco).toEqual({ retardoMs: 120, mezcla: 0.25 });
	});

	it("exige la tabla de onda y la acepta solo en su canal", () => {
		const onda = Array.from({ length: 32 }, (_, i) => i % 16);
		const cancion = unaPista(`onda onda=${onda.join(",")} | o2 a4`);
		expect(cancion.pistas[0]?.onda).toEqual(onda);
		expect(() => unaPista("onda | o2 a4")).toThrow(/necesita la opción onda/);
		expect(() => unaPista(`pulso1 onda=${onda.join(",")} | c4`)).toThrow(
			/solo vale en el canal onda/,
		);
	});

	it("rechaza canales repetidos y claves desconocidas", () => {
		expect(() => unaPista("pulso1 | c4\npulso1 | d4")).toThrow(
			/ya tiene una pista/,
		);
		expect(() => compilarMml(`${CABECERA}pulso1 ritmo=3 | c4\n`)).toThrow(
			/opción de pista desconocida/,
		);
	});
});

describe("compilarMml: errores con línea y columna", () => {
	it("señala el token desconocido", () => {
		expect(() => unaPista("pulso1 | z")).toThrow(/MML 3:10/);
	});

	it("señala un corchete sin cerrar", () => {
		expect(() => unaPista("pulso1 | [c d")).toThrow(
			/MML 3:\d+: falta el corchete/,
		);
	});

	it("rechaza notas con altura en el canal de ruido", () => {
		expect(() => unaPista("ruido | c4")).toThrow(/golpe desconocido "c"/);
	});

	it("rechaza @d y el deslizamiento en el canal de ruido", () => {
		expect(() => unaPista("ruido | @d1 b")).toThrow(/@d no vale/);
		expect(() => unaPista("ruido | ~+2 b")).toThrow(/deslizamiento no vale/);
	});

	it("rechaza un arpegio de más de cuatro notas y octavas MIDI imposibles", () => {
		expect(() => unaPista("pulso1 | (c e g b d)4")).toThrow(/2 a 4 notas/);
		expect(() => unaPista("pulso1 | o9 b")).toThrow(/rango MIDI/);
	});

	it("exige @cancion y @nombre antes de las pistas", () => {
		expect(() => compilarMml("pulso1 | c4\n")).toThrow(
			/faltan las directivas @cancion/,
		);
		expect(() => compilarMml("@cancion id=x bpm=120\npulso1 | c4\n")).toThrow(
			/falta la directiva @nombre/,
		);
	});

	it("ignora líneas vacías y comentarios", () => {
		const cancion = compilarMml(
			`; comentario\n\n${CABECERA}; otra nota\npulso1 | c4\n`,
		);
		expect(cancion.pasos).toBe(4);
	});
});

describe("compilarMml: canción completa", () => {
	const COMPLETA = `@cancion id=prueba-completa bpm=150 pasosPorNegra=4 repetir=true bucle=32 swing=0.05
@nombre audio.prueba-completa.nombre
@compas=16
pulso1 ciclo=25 vol=12 env=15,-1 vib=120,5,0.2 pan=-0.3 eco=120,0.25 | l8 [o4 c d e g c d e g | c d e g c d e g |]4
pulso2 ciclo=12.5 pan=0.2 | [l4 o3 a e a e | c g c g |]2
onda onda=0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0 | [l4 o2 a a e e | f f c g |]2
ruido corto | [l8 b h s h b h s h | x o h s b h s h |]4
`;

	it("valida con CancionSchema y conserva la estructura", () => {
		const cancion = compilarMml(COMPLETA);
		expect(CancionSchema.safeParse(cancion).success).toBe(true);
		expect(cancion.pasos).toBe(128);
		expect(cancion.pistas.map((p) => p.canal)).toEqual([
			"pulso1",
			"pulso2",
			"onda",
			"ruido",
		]);
		expect(cancion.pistas[0]?.notas.length).toBe(64);
	});

	it("renderiza de forma determinista y dentro de rango", () => {
		const cancion = compilarMml(COMPLETA);
		const a = renderizarCancion(cancion);
		const b = renderizarCancion(cancion);
		expect(Array.from(a)).toEqual(Array.from(b));
		expect(a.length).toBe(
			Math.round((128 * 60 * TASA_POR_DEFECTO) / (150 * 4)),
		);
		let pico = 0;
		for (const muestra of a) pico = Math.max(pico, Math.abs(muestra));
		expect(pico).toBeGreaterThan(0.2);
		expect(pico).toBeLessThan(1);
	});
});

describe("mml versionado", () => {
	const datos = JSON.parse(
		readFileSync(new URL("../datos/audio.json", import.meta.url), "utf8"),
	) as {
		canciones: Array<{ id: string; [k: string]: unknown }>;
		efectos: Efecto[];
	};

	it("cada canción de mml/ coincide con su entrada de audio.json", () => {
		const archivos = readdirSync(new URL("../mml/", import.meta.url)).filter(
			(archivo) => archivo.endsWith(".mml"),
		);
		expect(archivos.length).toBe(3);
		for (const archivo of archivos) {
			const cancion = compilarMml(
				readFileSync(new URL(`../mml/${archivo}`, import.meta.url), "utf8"),
			);
			const guardada = datos.canciones.find((c) => c.id === cancion.id);
			expect(guardada).toEqual(cancion);
		}
	});

	it("los efectos hechos a mano cumplen el esquema", () => {
		const efectos = JSON.parse(
			readFileSync(new URL("../datos/efectos.json", import.meta.url), "utf8"),
		) as unknown[];
		expect(efectos).toHaveLength(58);
		for (const efecto of efectos) {
			expect(() => EfectoSchema.parse(efecto)).not.toThrow();
		}
	});
});
