import {
	type AccionPartida,
	type ContextoPartida,
	crearPartida,
	type EstadoPartida,
	reducir,
} from "@santuario/core";
import { describe, expect, it } from "vitest";
import habitats from "../../../../packs/kanto/habitats.json";
import balanceCrudo from "../../../../packs/kanto/santuario.json";
import { opcionesPartida, PartidaSchema } from "./partida.js";
import { desempaquetar, ErrorGuardado, empaquetar } from "./sobre.js";

// biome-ignore lint/suspicious/noExplicitAny: los tests editan el JSON de la partida a mano
type Libre = any;

const balance = balanceCrudo as unknown as ContextoPartida["balance"];

const ctx = (): ContextoPartida => ({
	balance: structuredClone(balance),
	habitats: habitats as unknown as ContextoPartida["habitats"],
	fabricar: ({ especie, uid, origen }) => ({
		uid,
		especie,
		naturaleza: "Hardy",
		nivel: 5,
		tipos: ["normal"],
		preferidos: [],
		especialidades: {},
		usosEspecialidad: {},
		hambre: 80,
		animo: 60,
		amistad: 0,
		estado: "descansado",
		tarea: { tipo: "nada" },
		zona: 0,
		origen,
		diasInquieto: 0,
		trabajoHoy: "ninguno",
		habloHoy: false,
		peticionCumplidaHoy: false,
	}),
});

const guardar = (p: EstadoPartida) => empaquetar(p, 1);
const cargar = (t: string) => desempaquetar(t, opcionesPartida);
const ir = (p: EstadoPartida, a: AccionPartida) => reducir(p, a, ctx()).partida;

/** Una jornada típica: Alba, Día con una obra y un trabajo, Atardecer y Noche. */
function jornada(p: EstadoPartida, n: number): EstadoPartida {
	let q = ir(p, { tipo: "comenzarDia" });
	if (n === 1) {
		q = ir(q, { tipo: "colocarKit", edificio: "lecho-hojas", x: 22, y: 13 });
	}
	q = ir(q, { tipo: "pasarDia" });
	return ir(q, { tipo: "dormir" });
}

const conResidentes = (): EstadoPartida => {
	const p = crearPartida("s1", ctx().balance);
	const f = ctx().fabricar;
	const rng = undefined as never;
	return {
		...p,
		santuario: {
			...p.santuario,
			residentes: [
				f({ especie: "pikachu", uid: "a1", origen: "captura", rng }),
				f({ especie: "geodude", uid: "a2", origen: "captura", rng }),
			],
			siguienteUid: 100,
		},
	};
};

describe("guardado de la partida", () => {
	it("una partida nueva sobrevive a guardar y cargar, idéntica", async () => {
		const p = crearPartida("s1", ctx().balance);
		expect(await cargar(await guardar(p))).toEqual(p);
	});

	it("10 jornadas guardando y recargando cada una dan el mismo resultado que sin guardar", async () => {
		let directa = conResidentes();
		let guardada = conResidentes();
		for (let n = 1; n <= 10; n++) {
			directa = jornada(directa, n);
			guardada = jornada(await cargar(await guardar(guardada)), n);
			expect(guardada).toEqual(directa);
		}
		expect(directa.santuario.jornada).toBe(11);
	});

	it("una expedición en curso se guarda y se carga con su mapa", async () => {
		let p = ir(conResidentes(), { tipo: "comenzarDia" });
		p = ir(p, { tipo: "salirAExpedicion", uids: ["a1"], semilla: "sx" });
		expect(p.expedicion).toBeDefined();
		expect(await cargar(await guardar(p))).toEqual(p);
	});

	it("la partida de después de volver (con campos undefined) también se carga", async () => {
		let p = ir(conResidentes(), { tipo: "comenzarDia" });
		p = ir(p, { tipo: "salirAExpedicion", uids: ["a1"], semilla: "sx" });
		const x = p.expedicion;
		if (!x) throw new Error("sin expedición");
		p = ir(p, {
			tipo: "actualizarExpedicion",
			expedicion: { ...x, estado: "derrota", dinero: 10 },
		});
		p = ir(p, { tipo: "volverDeExpedicion" });
		expect("expedicion" in p).toBe(true); // la propiedad existe con valor undefined
		expect(await cargar(await guardar(p))).toEqual(p);
	});
});

describe("PartidaSchema", () => {
	const base = () => structuredClone(conResidentes()) as unknown as Libre;

	it("rechaza una clave desconocida (un campo nuevo sin esquema no se pierde en silencio)", () => {
		const p = base();
		p.santuario.campoNuevo = 1;
		expect(PartidaSchema.safeParse(p).success).toBe(false);
	});

	it("rechaza datos imposibles: recurso negativo, hambre fuera de rango, uid repetido, zona 12", () => {
		const casos: ((p: Libre) => void)[] = [
			(p) => {
				p.santuario.recursos.madera = -1;
			},
			(p) => {
				p.santuario.residentes[0].hambre = 101;
			},
			(p) => {
				p.santuario.residentes[1].uid = "a1";
			},
			(p) => {
				p.santuario.residentes[0].zona = 12;
			},
			(p) => {
				p.santuario.terreno.losetas.pop();
			},
			(p) => {
				p.santuario.momento = "madrugada";
			},
		];
		for (const caso of casos) {
			const p = base();
			caso(p);
			expect(PartidaSchema.safeParse(p).success).toBe(false);
		}
	});

	it("rechaza una expedición con el mapa roto", async () => {
		let p = ir(conResidentes(), { tipo: "comenzarDia" });
		p = ir(p, { tipo: "salirAExpedicion", uids: ["a1"], semilla: "sx" });
		const roto = structuredClone(p) as unknown as Libre;
		roto.expedicion.mapa.capas.pop();
		expect(PartidaSchema.safeParse(roto).success).toBe(false);
	});

	it("un guardado con datos imposibles da 'invalido' al cargar, aunque la suma cuadre", async () => {
		const p = base();
		p.santuario.recursos.madera = -5;
		const texto = await empaquetar(p, 1);
		await expect(cargar(texto)).rejects.toBeInstanceOf(ErrorGuardado);
		await expect(cargar(texto)).rejects.toMatchObject({ codigo: "invalido" });
	});
});
