import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const raizAudio = fileURLToPath(
	new URL("../../packages/audio", import.meta.url),
);
const raizPacks = fileURLToPath(new URL("../../packs", import.meta.url));

// `eval` directo de @pkmn/sim (battle-stream): conocido y ajeno; solo se calla ese aviso
function callarEvalDePkmn(
	nivel: string,
	log: { code?: string; id?: string },
	porDefecto: (nivel: never, log: never) => void,
): void {
	if (log.code === "EVAL" && log.id?.includes("@pkmn")) return;
	porDefecto(nivel as never, log as never);
}

export default defineConfig({
	resolve: { alias: { "@packs": raizPacks, "@audio": raizAudio } },
	// Phaser va en un solo chunk grande: se sube el límite del aviso
	build: {
		outDir: "dist/web", // aparte de la salida de tsc
		chunkSizeWarningLimit: 2000,
		rolldownOptions: { onLog: callarEvalDePkmn },
	},
	// El Worker de combate (`@santuario/battle`) usa importaciones dinámicas del
	// simulador: Vite lo emite como módulo ES (el formato iife no admite chunks).
	worker: {
		format: "es",
		rolldownOptions: { onLog: callarEvalDePkmn },
	},
	// los paquetes viven fuera de la raíz de la app
	server: { fs: { allow: ["../.."] } },
});
