import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const raizPacks = fileURLToPath(new URL("../../packs", import.meta.url));

export default defineConfig({
	resolve: { alias: { "@packs": raizPacks } },
	build: { outDir: "dist/web" }, // aparte de la salida de tsc
	// los paquetes viven fuera de la raíz de la app
	server: { fs: { allow: ["../.."] } },
});
