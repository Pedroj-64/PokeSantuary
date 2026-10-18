import { describe, expect, it } from "vitest";
import { alPulsarTecla } from "./teclado.js";

/** Escena mínima: guarda el oyente de `keydown` para dispararlo a mano. */
function escenaFalsa() {
	let oyente: ((ev: KeyboardEvent) => void) | undefined;
	const escena = {
		input: {
			keyboard: {
				on: (_nombre: string, f: (ev: KeyboardEvent) => void) => {
					oyente = f;
				},
			},
		},
	};
	const pulsar = (key: string, timeStamp: number) =>
		oyente?.({ key, timeStamp, repeat: false } as KeyboardEvent);
	return { escena, pulsar };
}

// El ayudante recuerda el último `timeStamp` entre pruebas, igual que entre escenas:
// los valores crecen de una prueba a la siguiente.
describe("alPulsarTecla", () => {
	it("atiende cada pulsación una sola vez aunque Phaser reprocese el mismo evento", () => {
		const { escena, pulsar } = escenaFalsa();
		const teclas: string[] = [];
		alPulsarTecla(escena as never, (ev) => teclas.push(ev.key));
		pulsar("Escape", 1320.5);
		pulsar("Escape", 1320.5); // la cola de Phaser entrega el mismo evento otra vez
		pulsar("1", 1349.2);
		pulsar("1", 1349.2);
		expect(teclas).toEqual(["Escape", "1"]);
	});

	it("no atiende en una escena nueva un evento que ya trató la anterior (restart)", () => {
		const vieja = escenaFalsa();
		const nueva = escenaFalsa();
		const teclas: string[] = [];
		alPulsarTecla(vieja.escena as never, (ev) =>
			teclas.push(`vieja ${ev.key}`),
		);
		vieja.pulsar("1", 2500);
		alPulsarTecla(nueva.escena as never, (ev) =>
			teclas.push(`nueva ${ev.key}`),
		);
		nueva.pulsar("Escape", 2480); // y también uno anterior que ya se había tratado
		nueva.pulsar("1", 2500); // la cola de Phaser entrega el mismo evento a la escena recién creada
		nueva.pulsar("2", 2530);
		expect(teclas).toEqual(["vieja 1", "nueva 2"]);
	});

	it("dos pulsaciones distintas de la misma tecla cuentan las dos", () => {
		const { escena, pulsar } = escenaFalsa();
		const teclas: string[] = [];
		alPulsarTecla(escena as never, (ev) => teclas.push(ev.key));
		pulsar("1", 3100);
		pulsar("1", 3160);
		expect(teclas).toEqual(["1", "1"]);
	});
});
