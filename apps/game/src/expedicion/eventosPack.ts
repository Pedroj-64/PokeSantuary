import eventosCrudo from "@packs/kanto/eventos.json?raw";
import { type Evento, EventosSchema } from "@santuario/data";

/** Eventos del pack kanto; lanza si el JSON no valida. */
export const cargarEventos = (): Evento[] =>
	EventosSchema.parse(JSON.parse(eventosCrudo));
