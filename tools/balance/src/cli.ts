import { cargarDatosPack } from "./datos.js";
import { simular } from "./simular.js";

const arg = process.argv.indexOf("--n");
const n = arg >= 0 ? Number(process.argv[arg + 1]) : 500;
if (!Number.isInteger(n) || n < 1) {
	console.error("Uso: pnpm balance --n <expediciones, entero >= 1>");
	process.exit(1);
}

const conNiveles = process.argv.includes("--niveles");
const inteligente = process.argv.includes("--inteligente");
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

const r = await simular(
	Array.from({ length: n }, (_, i) => `balance${i}`),
	cargarDatosPack({
		progresion: conNiveles,
		nivelGimnasio,
		politica: inteligente,
	}),
);
console.log(`Expediciones: ${r.total}`);
console.log(`Victorias: ${r.victorias} (${(r.tasa * 100).toFixed(1)} %)`);
console.log(`Derrotas por piso: ${r.muertesPorPiso.join(" / ")}`);
if (inteligente) console.log("Política: inteligente");
if (r.nivelMedioAlJefe !== undefined) {
	console.log(
		`Nivel medio al jefe: ${r.nivelMedioAlJefe
			.map((nivel) => nivel.toFixed(1))
			.join(" / ")}`,
	);
}
