import { fileURLToPath } from "node:url";
import { construir } from "./construir.js";
import { verificar } from "./verificar.js";

const aqui = (ruta: string) => fileURLToPath(new URL(ruta, import.meta.url));
const dirPack = aqui("../../../packs/kanto");

const [comando] = process.argv.slice(2);
if (comando === "build") {
	const n = await construir({
		especies: aqui("../especies.json"),
		movimientos: aqui("../movimientos.json"),
		dirCache: aqui("../cache"),
		dirPack,
	});
	console.log(`${n} especies, movimientos y sets escritos en packs/kanto`);
} else if (comando === "verify") {
	const errores = await verificar(dirPack);
	if (errores.length > 0) {
		console.error(
			`Verificación fallida:\n${errores.map((e) => `- ${e}`).join("\n")}`,
		);
		process.exitCode = 1;
	} else console.log("packs/kanto: verificación correcta");
} else {
	console.error("Uso: cli.ts build | verify");
	process.exitCode = 1;
}
