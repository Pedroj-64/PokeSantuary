import especiesCrudo from "@packs/kanto/especies.json?raw";
import movimientosCrudo from "@packs/kanto/movimientos.json?raw";
import setsCrudo from "@packs/kanto/sets.json?raw";
import { construirDatosCombate } from "./datos.js";

/** Datos del pack kanto empaquetados por Vite; lanza si no validan. */
export const cargarDatosCombate = () =>
	construirDatosCombate(especiesCrudo, movimientosCrudo, setsCrudo);
