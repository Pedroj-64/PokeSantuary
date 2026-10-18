import { cargarDatosPack } from "./datos.js";
import { simular } from "./simular.js";

const arg = process.argv.indexOf("--n");
const n = arg >= 0 ? Number(process.argv[arg + 1]) : 500;
if (!Number.isInteger(n) || n < 1) {
	console.error("Uso: pnpm balance --n <expediciones, entero >= 1>");
	process.exit(1);
}

const r = await simular(
	Array.from({ length: n }, (_, i) => `balance${i}`),
	cargarDatosPack(),
);
console.log(`Expediciones: ${r.total}`);
console.log(`Victorias: ${r.victorias} (${(r.tasa * 100).toFixed(1)} %)`);
console.log(`Derrotas por piso: ${r.muertesPorPiso.join(" / ")}`);
