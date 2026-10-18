/**
 * Semilla de una partida o combate: `?semilla=` si viene; si no, una aleatoria
 * con `crypto.getRandomValues`. Es el ÚNICO sitio del juego donde se admite una
 * semilla no determinista; se obtiene una vez al arrancar y de ahí en adelante
 * todo (mapa, equipos, simulador, IA) es función pura de ella.
 */
export function obtenerSemilla(): string {
	const dada = new URLSearchParams(location.search).get("semilla");
	if (dada !== null) return dada;
	const bytes = crypto.getRandomValues(new Uint32Array(2));
	return Array.from(bytes, (b) => b.toString(16).padStart(8, "0")).join("");
}
