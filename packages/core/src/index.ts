export {
	alineacionAutomatica,
	conscientes,
	necesitaElegir,
	TAMANO_ALINEACION,
	validarAlineacion,
} from "./alineacion.js";
export {
	aprender,
	aprenderTodos,
	type EntradaAprendizaje,
	MAX_MOVIMIENTOS,
	type Movimientos,
	movimientosIniciales,
	nuevosMovimientos,
	type ResultadoAprender,
} from "./aprender.js";
export {
	type DatosCaptura,
	intentarCaptura,
	probCaptura,
} from "./captura.js";
export { capturar, equipoLleno, sustituirMiembro } from "./equipo.js";
export {
	aplicarEfecto,
	elegirEvento,
	type ResultadoEfecto,
	type RivalEvento,
	sustituirRuna,
} from "./eventos.js";
export {
	AMISTAD_EVOLUCION,
	type CondicionEvolucion,
	type ContextoEvolucion,
	type Evolucion,
	evolucionesDisponibles,
	type MomentoJornada,
} from "./evolucionar.js";
export {
	curar,
	curarAlMasHerido,
	type EstadoExpedicion,
	elegibles,
	entrar,
	esNodoDeCombate,
	iniciarExpedicion,
	liquidar,
	type MiembroExp,
	type ResultadoCombate,
	resolverCombate,
} from "./expedicion.js";
export {
	type EntradaDerrota,
	estaFallido,
	llamasIniciales,
	type ResultadoDerrota,
	resolverDerrota,
	type TablaFarol,
} from "./farol.js";
export {
	ESTADISTICAS,
	type Estadistica,
	efectoNaturaleza,
	elegirNaturaleza,
	generarIV,
	type IV,
	multiplicadorNaturaleza,
} from "./individuo.js";
export {
	generarPiso,
	type MapaPiso,
	type NodoMapa,
	type TipoNodo,
	validarMapa,
} from "./mapa.js";
export {
	comprarArticulo,
	cuantos,
	gastar,
	type Mochila,
	totalBayas,
	usarBaya,
	usarBayaAlMasHerido,
} from "./mochila.js";
export {
	alcanzaEvolucion,
	nivelBaseGimnasio,
	nivelInicial,
	nivelRival,
	subirNiveles,
	type TablaNiveles,
	type TablaSubida,
	type TipoRival,
} from "./niveles.js";
export {
	type AccionPartida,
	type ContextoPartida,
	crearPartida,
	type EstadoPartida,
	type ResultadoPartida,
	reducir,
	VERSION_PARTIDA,
} from "./partida.js";
export { type Accion, type Estado, type Evento, paso } from "./paso.js";
export {
	type ContextoProgresion,
	type EventoProgresion,
	elegirOlvido,
	evolucionar,
	type OpcionesVictoria,
	type ResultadoProgresion,
	registrarVictoria,
} from "./progresion.js";
export {
	type RangoDinero,
	recompensa,
	type TablaRecompensas,
} from "./recompensa.js";
export { reproducir } from "./repeticion.js";
export { crearRng, type Rng } from "./rng.js";
export {
	anadirRuna,
	type IdRuna,
	MAX_RUNAS,
	type Modificadores,
	modificadores,
	resolverMisterio,
} from "./runas.js";
export {
	celebrar,
	ceremoniasDisponibles,
	type DefCeremonia,
	type IdCeremonia,
	motivoNoPuede,
	puedeCelebrar,
	type RegistroCeremonias,
	type TablaCeremonias,
} from "./santuario/ceremonias.js";
export { esTemaDelDia, TEMAS_CHARLA, temasDelDia } from "./santuario/charla.js";
export {
	codigoElegido,
	type EfectoCodigo,
	type EfectoTotal,
	type EleccionesCodigos,
	efectoDeCodigos,
	elegirCodigo,
	type IdCodigo,
	nivelesPendientes,
	type Opcion as OpcionCodigo,
	type TablaCodigos,
} from "./santuario/codigos.js";
export {
	type AccionMarcada,
	crearSantuario,
	type DecoracionBalance,
	type Edificio,
	type EdificioBalance,
	type EstadoResidente,
	type EstadoSantuario,
	type Loseta,
	type Momento,
	type OrigenResidente,
	type Residente,
	type Sabor,
	type SantuarioBalance,
	type Tarea,
	type TemaCharla,
	type Terreno,
	type TipoLoseta,
} from "./santuario/estado.js";
export {
	equipoDeExpedicion,
	type Fabricar,
	iniciarDesdeSantuario,
	liquidarEnSantuario,
	type ResultadoLiquidacion,
} from "./santuario/expedicion.js";
export {
	admitir,
	asignarLecho,
	asignarTarea,
	capacidadResidentes,
	colocarKit,
	mejorarEdificio,
} from "./santuario/gestion.js";
export {
	type ContextoJornada,
	detectarHabitats,
	type HabitatData,
	type MotivoVisita,
	type RecetaHabitat,
} from "./santuario/habitats.js";
export {
	amanecer,
	calcularArmonia,
	confortDeZona,
	type EventoSantuario,
	inquietos,
	PASOS_ALBA,
	PASOS_ATARDECER,
	type Paso,
	puntosDecoracion,
	type Resultado,
	resolverAtardecer,
	zonaDe,
} from "./santuario/jornada.js";
export { pasoObra, pasoProduccion } from "./santuario/produccion.js";
export {
	aplicarRetorno,
	aplicarRetornoACapturado,
	type CatalogoProgresion,
	type DatosEspecieProgresion,
	miembroDeResidente,
	miembroNuevoDeCaptura,
	nivelDeSalida,
} from "./santuario/puente.js";
export {
	accionesPosibles,
	colocarCamino,
	colocarDecoracion,
	desmarcarAccion,
	enIsla,
	esAreaUtil,
	loseta,
	marcarAccion,
	nivelEspecialidad,
	pasoTerreno,
	plantarBrote,
	terrenoInicial,
	vecinosDe,
} from "./santuario/terreno.js";
export {
	type Articulo,
	comprar,
	ofertaTienda,
	precioEnPiso,
} from "./tienda.js";
