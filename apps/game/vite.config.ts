import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const raizPacks = fileURLToPath(new URL("../../packs", import.meta.url));

export default defineConfig({
	resolve: { alias: { "@packs": raizPacks } },
	// Phaser va en un solo chunk grande: se sube el límite del aviso
	build: { outDir: "dist/web", chunkSizeWarningLimit: 2000 }, // aparte de la salida de tsc
	// los paquetes viven fuera de la raíz de la app
	server: { fs: { allow: ["../.."] } },
});
