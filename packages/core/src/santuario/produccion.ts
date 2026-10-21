import { efectoDeCodigos } from "./codigos.js";
import type { Edificio, EstadoSantuario, SantuarioBalance } from "./estado.js";
import type { EventoSantuario, Paso } from "./jornada.js";

/**
 * Marca interna del paso de obra: el edificio se terminó en este Atardecer y
 * todavía no puede producir. La quita el paso de producción, así que no llega
 * al estado guardado.
 */
const TERMINADO_HOY = "#terminado-hoy";

/** Recursos que no pasan por el tope del Almacén. */
const SIN_TOPE = new Set(["pokedolares", "fragmentos", "recuerdos"]);

/** Tope de almacenamiento: el mayor Almacén terminado o el nivel 1. */
function topeAlmacen(e: EstadoSantuario, b: SantuarioBalance): number {
	const niveles = e.edificios
		.filter((ed) => ed.tipo === "almacen" && ed.obraRestante === 0)
		.map((ed) => ed.nivel);
	const nivel = niveles.length > 0 ? Math.max(...niveles) : 1;
	return b.capacidadAlmacen[nivel - 1] ?? b.capacidadAlmacen[0] ?? 0;
}

/** Recorta las bayas en conjunto, empezando por el sabor con más existencias. */
function recortarBayas(
	recursos: Record<string, number>,
	tope: number,
	eventos: EventoSantuario[],
): void {
	const sabores = Object.keys(recursos).filter((c) => c.startsWith("baya:"));
	const total = sabores.reduce((suma, c) => suma + (recursos[c] ?? 0), 0);
	if (total <= tope) return;
	let recorte = total - tope;
	// Empate de existencias: orden alfabético, para que sea determinista.
	const orden = [...sabores].sort((a, z) => {
		const ca = recursos[a] ?? 0;
		const cz = recursos[z] ?? 0;
		if (ca !== cz) return cz - ca;
		return a < z ? -1 : a > z ? 1 : 0;
	});
	for (const clave of orden) {
		if (recorte <= 0) break;
		const disponible = recursos[clave] ?? 0;
		const cantidad = Math.min(disponible, recorte);
		if (cantidad <= 0) continue;
		recursos[clave] = disponible - cantidad;
		recorte -= cantidad;
		eventos.push({ tipo: "recursoPerdido", recurso: clave, cantidad });
	}
}

/**
 * Atardecer: cada constructor aporta su obra al edificio que tiene asignado.
 * Al llegar a 0 el edificio queda terminado, marcado para no producir hoy.
 */
export const pasoObra: Paso = (e, b) => {
	const aportes = new Map<string, number>();
	for (const r of e.residentes) {
		if (r.tarea.tipo !== "construir") continue;
		const nivel = r.especialidades.construir ?? 0;
		const aporte =
			b.produccion.obraBasePorConstructor +
			b.produccion.obraPorNivelEspecialidad * nivel +
			(e.temaCharla === "raices" ? b.produccion.obraCharlaRaices : 0);
		aportes.set(
			r.tarea.edificio,
			(aportes.get(r.tarea.edificio) ?? 0) + aporte,
		);
	}

	const eventos: EventoSantuario[] = [];
	const edificios = e.edificios.map((ed): Edificio => {
		if (ed.obraRestante <= 0) return ed;
		const diaria = aportes.get(ed.uid) ?? 0;
		const obraRestante = Math.max(0, ed.obraRestante - diaria);
		if (obraRestante > 0) return { ...ed, obraRestante };
		eventos.push({ tipo: "obraTerminada", uid: ed.uid, edificio: ed.tipo });
		return {
			...ed,
			obraRestante: 0,
			resto: { ...ed.resto, [TERMINADO_HOY]: 1 },
		};
	});
	return { estado: { ...e, edificios }, eventos };
};

/**
 * Atardecer: cada residente que trabaja suma su producción al resto del
 * edificio y este suelta los enteros a los recursos. Después se aplica el tope
 * del Almacén. Se calcula con el Ánimo y la Armonía de antes del Atardecer.
 */
export const pasoProduccion: Paso = (e, b) => {
	const recursos = { ...e.recursos };
	const eventos: EventoSantuario[] = [];
	// Códigos del Altar: multiplican la producción (y la del Huerto aparte).
	const codigos = efectoDeCodigos(e.codigos ?? {}, b.codigos);

	// Copia de los restos sin la marca de obra y lista de quién terminó hoy.
	const restos = new Map<string, Record<string, number>>();
	const terminadosHoy = new Set<string>();
	for (const ed of e.edificios) {
		const resto = { ...ed.resto };
		if (resto[TERMINADO_HOY] !== undefined) {
			terminadosHoy.add(ed.uid);
			delete resto[TERMINADO_HOY];
		}
		restos.set(ed.uid, resto);
	}

	// trabajoHoy: dónde trabajó cada residente y si era lo que prefiere.
	const marcas = new Map<string, "preferido" | "no-preferido" | "ninguno">();
	for (const r of e.residentes) {
		let marca: "preferido" | "no-preferido" | "ninguno" = "ninguno";
		if (r.tarea.tipo === "construir") {
			marca =
				(r.especialidades.construir ?? 0) > 0 ? "preferido" : "no-preferido";
		} else if (
			r.tarea.tipo === "trabajo" &&
			(r.estado === "descansado" || r.estado === "visitante")
		) {
			const asignado = r.tarea.edificio;
			const edificio = e.edificios.find((x) => x.uid === asignado);
			const def =
				edificio === undefined
					? undefined
					: b.edificios.find((d) => d.id === edificio.tipo);
			if (
				edificio !== undefined &&
				edificio.obraRestante === 0 &&
				def?.trabajo !== undefined
			) {
				marca = r.preferidos.includes(def.trabajo)
					? "preferido"
					: "no-preferido";
			}
		}
		marcas.set(r.uid, marca);
	}

	for (const r of e.residentes) {
		if (r.tarea.tipo !== "trabajo") continue;
		if (r.estado !== "descansado" && r.estado !== "visitante") continue;
		const asignado = r.tarea.edificio;
		const edificio = e.edificios.find((x) => x.uid === asignado);
		if (edificio === undefined || edificio.obraRestante > 0) continue;
		if (terminadosHoy.has(edificio.uid)) continue;
		const def = b.edificios.find((d) => d.id === edificio.tipo);
		if (
			def?.produce === undefined ||
			def.trabajo === undefined ||
			def.plazas.length === 0
		) {
			continue;
		}
		const resto = restos.get(edificio.uid);
		if (resto === undefined) continue;

		const multNivel = b.produccion.multNivel[edificio.nivel - 1] ?? 1;
		const preferido = r.preferidos.includes(def.trabajo);
		const afin = def.especialidadesAfines.some(
			(id) => (r.especialidades[id] ?? 0) > 0,
		);
		const produccion =
			def.produce.base *
			multNivel *
			(preferido ? b.produccion.multPreferido : 1) *
			(b.produccion.animoBase + r.animo / 100) *
			(afin ? b.produccion.multEspecialidad : 1) *
			(e.armonia >= b.armonia.umbralAlto ? b.armonia.multProduccionAlta : 1) *
			(r.diasInquieto > 0 ? b.inquietud.multProduccion : 1) *
			(e.temaCharla === "trabajo" ? b.produccion.multCharlaTrabajo : 1) *
			codigos.multProduccion *
			(edificio.tipo === "huerto-bayas" ? codigos.multHuerto : 1);
		const recurso =
			def.produce.recurso === "baya"
				? `baya:${edificio.variedad ?? "neutro"}`
				: def.produce.recurso;
		resto[recurso] = (resto[recurso] ?? 0) + produccion;

		// La Cantera da mineral en valor esperado, sin tirada de azar.
		if (
			edificio.tipo === "cantera" &&
			r.tipos.some((t) => b.produccion.tiposMineral.includes(t))
		) {
			resto.mineral = (resto.mineral ?? 0) + b.produccion.mineralProbabilidad;
		}
	}

	// Suelta los enteros y guarda el resto decimal (el 1e-9 evita que un
	// 0,9999999999999999 se quede sin su unidad).
	for (const resto of restos.values()) {
		for (const [recurso, valor] of Object.entries(resto)) {
			const enteros = Math.floor(valor + 1e-9);
			if (enteros <= 0) continue;
			resto[recurso] = Math.max(0, valor - enteros);
			recursos[recurso] = (recursos[recurso] ?? 0) + enteros;
		}
	}

	// Tope del Almacén: lo que sobra se pierde.
	const tope = topeAlmacen(e, b);
	recortarBayas(recursos, tope, eventos);
	for (const [clave, cantidad] of Object.entries(recursos)) {
		if (SIN_TOPE.has(clave) || clave.startsWith("baya:")) continue;
		if (cantidad <= tope) continue;
		recursos[clave] = tope;
		eventos.push({
			tipo: "recursoPerdido",
			recurso: clave,
			cantidad: cantidad - tope,
		});
	}

	return {
		estado: {
			...e,
			recursos,
			edificios: e.edificios.map((ed) => ({
				...ed,
				resto: restos.get(ed.uid) ?? {},
			})),
			residentes: e.residentes.map((r) => ({
				...r,
				trabajoHoy: marcas.get(r.uid) ?? "ninguno",
			})),
		},
		eventos,
	};
};
