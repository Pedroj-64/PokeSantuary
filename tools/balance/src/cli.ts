import { barrer, type ConfiguracionBarrido } from "./barrido.js";
import { cargarDatosPack } from "./datos.js";
import { simular } from "./simular.js";

const arg = process.argv.indexOf("--n");
const n = arg >= 0 ? Number(process.argv[arg + 1]) : 500;
if (!Number.isInteger(n) || n < 1) {
	console.error("Uso: pnpm balance --n <expediciones, entero >= 1>");
	process.exit(1);
}

const barrido = process.argv.includes("--barrido");
const conNiveles = process.argv.includes("--niveles") || barrido;
const tipos = process.argv.includes("--tipos");
const inteligente = process.argv.includes("--inteligente") || barrido || tipos;
const argGimnasio = process.argv.indexOf("--gimnasio");
const nivelGimnasio =
	argGimnasio >= 0 ? Number(process.argv[argGimnasio + 1]) : 0;
if (
	!Number.isInteger(nivelGimnasio) ||
	nivelGimnasio < 0 ||
	nivelGimnasio > 5
) {
	console.error(
		"Uso: pnpm balance --niveles --gimnasio <nivel de gimnasio, entero de 0 a 5>",
	);
	process.exit(1);
}
if (argGimnasio >= 0 && !conNiveles) {
	console.error("Uso: --gimnasio solo tiene sentido junto a --niveles");
	process.exit(1);
}

const argLlamas = process.argv.indexOf("--llamas");
const llamas = argLlamas >= 0 ? Number(process.argv[argLlamas + 1]) : undefined;
if (
	argLlamas >= 0 &&
	(llamas === undefined || !Number.isInteger(llamas) || llamas < 0)
) {
	console.error("Uso: pnpm balance --llamas <llamas, entero >= 0>");
	process.exit(1);
}

const argEquipo = process.argv.indexOf("--equipo");
const tamanoEquipo =
	argEquipo >= 0 ? Number(process.argv[argEquipo + 1]) : undefined;
if (
	argEquipo >= 0 &&
	(tamanoEquipo === undefined ||
		!Number.isInteger(tamanoEquipo) ||
		tamanoEquipo < 1 ||
		tamanoEquipo > 6)
) {
	console.error("Uso: pnpm balance --equipo <miembros, entero de 1 a 6>");
	process.exit(1);
}

const semillas = Array.from({ length: n }, (_, i) => `balance${i}`);
const datosBase = cargarDatosPack({
	progresion: conNiveles,
	nivelGimnasio,
	politica: inteligente,
});
const datos = {
	...datosBase,
	...(tipos ? { usarTipos: true } : {}),
	...(llamas === undefined ? {} : { llamas }),
	...(tamanoEquipo === undefined ? {} : { tamanoEquipo }),
};

if (barrido) {
	/** Las tres configuraciones del GDD y su ventana objetivo. */
	const configs: readonly ConfiguracionBarrido[] = [
		{
			nombre: "G0 · 1 llama · equipo 3",
			nivelGimnasio: 0,
			llamas: 1,
			tamanoEquipo: 3,
		},
		{
			nombre: "G2 · 2 llamas · equipo 4",
			nivelGimnasio: 2,
			llamas: 2,
			tamanoEquipo: 4,
		},
		{
			nombre: "G5 · 3 llamas · equipo 6",
			nivelGimnasio: 5,
			llamas: 3,
			tamanoEquipo: 6,
		},
	];
	const rangos: Readonly<Record<number, readonly [number, number]>> = {
		0: [25, 40],
		2: [40, 60],
		5: [75, 85],
	};
	const filas = await barrer(semillas, datos, configs);
	console.log(`Barrido GDD · ${n} expediciones por configuración`);
	for (const [indice, config] of configs.entries()) {
		const fila = filas[indice];
		if (fila === undefined) continue;
		const rango = rangos[config.nivelGimnasio] ?? [0, 100];
		const porcentaje = fila.tasa * 100;
		const posicion =
			porcentaje < rango[0]
				? "por debajo"
				: porcentaje > rango[1]
					? "por encima"
					: "dentro";
		const niveles =
			fila.nivelMedioAlJefe === undefined
				? "—"
				: fila.nivelMedioAlJefe.map((nivel) => nivel.toFixed(1)).join(" / ");
		console.log(
			`${config.nombre}: ${porcentaje.toFixed(1)} % (${rango[0]}-${rango[1]} %) ${posicion} | victorias ${fila.victorias}/${fila.total} | derrotas por piso ${fila.muertesPorPiso.join(" / ")} | nivel medio al jefe ${niveles}`,
		);
	}
} else {
	const r = await simular(semillas, datos);
	console.log(`Expediciones: ${r.total}`);
	console.log(`Victorias: ${r.victorias} (${(r.tasa * 100).toFixed(1)} %)`);
	console.log(`Derrotas por piso: ${r.muertesPorPiso.join(" / ")}`);
	if (inteligente)
		console.log(`Política: ${tipos ? "con tipos" : "inteligente"}`);
	if (r.nivelMedioAlJefe !== undefined) {
		console.log(
			`Nivel medio al jefe: ${r.nivelMedioAlJefe
				.map((nivel) => nivel.toFixed(1))
				.join(" / ")}`,
		);
	}
}
