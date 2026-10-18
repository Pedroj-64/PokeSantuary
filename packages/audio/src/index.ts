import { type ColeccionAudio, ColeccionAudioSchema } from "./modelo.js";

export * from "./mml.js";
export * from "./modelo.js";
export * from "./renderizar.js";

/**
 * Valida una colección de audio (canciones y efectos) contra el esquema.
 *
 * @throws {ZodError} Si algún campo falta o no cumple el esquema.
 */
export const parsearColeccion = (json: unknown): ColeccionAudio =>
	ColeccionAudioSchema.parse(json);
