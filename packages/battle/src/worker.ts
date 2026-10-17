import { expose } from "comlink";
import { SesionCombate } from "./sesion.js";

/**
 * Punto de entrada del Worker: expone una sesión de combate por Comlink.
 * Se carga con `new Worker(new URL("./worker.ts", import.meta.url))`, así el
 * simulador queda fuera del paquete principal.
 */
expose(new SesionCombate());
