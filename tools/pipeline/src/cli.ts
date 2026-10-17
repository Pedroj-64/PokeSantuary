import { construir } from "./construir.js";
import { verificar } from "./verificar.js";

const aqui = (ruta: string) => new URL(ruta, import.meta.url).pathname;
const dirPack = aqui("../../../packs/kanto");

const [comando] = process.argv.slice(2);
if (comando === "build") {
	const n = await construir({
		especies: aqui("../especies.json"),
		dirCache: aqui("../cache"),
		dirPack,
	});
	console.log(`${n} especies escritas en packs/kanto`);
} else if (comando === "verify") {
	const errores = verificar(dirPack);
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
