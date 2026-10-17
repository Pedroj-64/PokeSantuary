import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const raizPacks = fileURLToPath(new URL("../../packs", import.meta.url));

export default defineConfig({
	resolve: { alias: { "@packs": raizPacks } },
	// Phaser va en un solo chunk grande: se sube el límite del aviso
	build: { outDir: "dist/web", chunkSizeWarningLimit: 2000 }, // aparte de la salida de tsc
	// El Worker de combate (`@santuario/battle`) usa importaciones dinámicas del
	// simulador: Vite lo emite como módulo ES (el formato iife no admite chunks).
	worker: {
		format: "es",
		rolldownOptions: {
			// `eval` directo de @pkmn/sim (battle-stream): conocido y ajeno; solo se calla ese aviso
			onLog(nivel, log, porDefecto) {
				if (log.code === "EVAL" && log.id?.includes("@pkmn")) return;
				porDefecto(nivel, log);
			},
		},
	},
	// los paquetes viven fuera de la raíz de la app
	server: { fs: { allow: ["../.."] } },
});
