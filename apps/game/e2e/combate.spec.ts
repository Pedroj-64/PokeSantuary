import { expect, type Page, test } from "@playwright/test";

type Estado = {
	fase: string;
	peticion: {
		tipo: string;
		movimientos: { deshabilitado: boolean }[];
		equipo: { activo: boolean; debilitado: boolean }[];
	} | null;
	terminado: string | null;
	panel: string | null;
	mensajes: string[];
	hpJugador: number;
	hpRival: number;
	error: { titulo: string; cuerpo: string; detalle: string } | null;
};

const estado = (p: Page) =>
	p.evaluate(
		"window.__santuario.combate?.estado() ?? { fase: 'sin-gancho' }",
	) as Promise<Estado>;

async function esperarFase(p: Page, fase: string) {
	await expect.poll(async () => (await estado(p)).fase).toBe(fase);
}

/**
 * Juega hasta el final con una política fija: siempre el primer movimiento con PP
 * y, si toca cambiar, el primer miembro vivo. Devuelve cuántos cambios forzados hubo.
 */
async function jugarHastaElFinal(p: Page): Promise<number> {
	let forzados = 0;
	for (let i = 0; i < 200; i++) {
		await expect
			.poll(async () => (await estado(p)).fase)
			.toMatch(/^(menu|cambio|fin|error)$/);
		const s = await estado(p);
		if (s.fase === "fin") return forzados;
		if (s.fase === "error") throw new Error(`error: ${s.error?.detalle}`);
		let e: object;
		if (s.fase === "menu")
			e = {
				tipo: "movimiento",
				indice: s.peticion?.movimientos.findIndex((m) => !m.deshabilitado),
			};
		else {
			if (s.peticion?.tipo === "cambio-forzado") {
				forzados++;
				// con el activo caído solo hay lista de cambio (Esc ahí sale a la lista, no vuelve al menú)
				expect((await estado(p)).fase).toBe("cambio");
			}
			e = {
				tipo: "cambio",
				indice: s.peticion?.equipo.findIndex((m) => !m.activo && !m.debilitado),
			};
		}
		await p.evaluate(`window.__santuario.combate.elegir(${JSON.stringify(e)})`);
	}
	throw new Error("el combate no terminó");
}

const hashRegistro = (p: Page) =>
	p.evaluate("window.__santuario.combate.registroHash()") as Promise<string>;

async function abrir(page: Page, semilla: string) {
	await page.goto(`/?test=1&semilla=${semilla}`);
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("b");
	await esperarFase(page, "menu");
}

/*
 * Semillas con política fija (primer movimiento con PP; primer miembro vivo al
 * caer el activo). Se hallaron recorriendo `s1`…`s40` en un bucle e2e desechable
 * con esa misma política: `s1` termina en derrota y `s4` en victoria, y ambas
 * incluyen cambio forzado del jugador.
 */
const SEMILLA_VICTORIA = "s4";
const SEMILLA_DERROTA = "s1";
/**
 * Hash SHA-256 del registro crudo de `s4` con esa política. Si esta prueba falla,
 * cambió el motor, los datos o la IA y los combates ya no son los mismos:
 * revisa el cambio y, si es deliberado, actualiza el valor a propósito.
 */
const HASH_VICTORIA =
	"e3179aa5ba3922b5a68c8eaaa1cd03d51f2741b665c0b8c9a8c0cdbdfc1fda0c";

let errores: string[] = [];
test.beforeEach(({ page }) => {
	errores = [];
	page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
	page.on("console", (m) => {
		if (m.type() === "error" && !m.text().includes("404"))
			errores.push(`console.error: ${m.text()}`);
	});
});
test.afterEach(() => expect(errores).toEqual([]));

test.use({ locale: "es-ES" });

test("determinismo: misma semilla y elecciones, mismo registro; otra semilla, otro", async ({
	page,
}) => {
	await abrir(page, SEMILLA_VICTORIA);
	const inicial = await estado(page);
	expect(inicial.peticion?.movimientos).toHaveLength(4);
	expect(inicial.mensajes[0]).toBe("¡Comienza el combate!");

	// una elección ilegal no es fatal: el menú sigue disponible
	await expect(
		page.evaluate(
			"window.__santuario.combate.elegir({tipo:'cambio',indice:0})",
		),
	).resolves.toBeUndefined();
	await esperarFase(page, "menu");

	await jugarHastaElFinal(page);
	const hash = await hashRegistro(page);
	expect(
		hash,
		"El registro del combate fijo cambió (motor, datos o IA). Revisa el cambio y, si es deliberado, actualiza HASH_VICTORIA.",
	).toBe(HASH_VICTORIA);

	// misma semilla y mismas elecciones: mismo registro
	await page.keyboard.press("Escape");
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("b");
	await esperarFase(page, "menu");
	await jugarHastaElFinal(page);
	expect(await hashRegistro(page)).toBe(hash);

	// semilla distinta: registro distinto
	await abrir(page, SEMILLA_DERROTA);
	await jugarHastaElFinal(page);
	expect(await hashRegistro(page)).not.toBe(hash);
});

const FINALES = {
	"es-ES": { victoria: "¡Victoria!", derrota: "Derrota" },
	"en-US": { victoria: "Victory!", derrota: "Defeat" },
} as const;

for (const idioma of ["es-ES", "en-US"] as const) {
	test.describe(`final real (${idioma})`, () => {
		test.use({ locale: idioma });

		for (const [resultado, semilla, ganador] of [
			["victoria", SEMILLA_VICTORIA, "jugador"],
			["derrota", SEMILLA_DERROTA, "rival"],
		] as const) {
			test(`${resultado} completa con cambio forzado`, async ({ page }) => {
				await abrir(page, semilla);
				const forzados = await jugarHastaElFinal(page);
				expect(forzados).toBeGreaterThan(0);
				const fin = await estado(page);
				expect(fin.terminado).toBe(ganador);
				expect(fin.panel).toBe(FINALES[idioma][resultado]);
				await page.screenshot({
					path: `test-results/combate-${resultado}-${idioma}.png`,
				});
				await page.keyboard.press("Escape");
				await page.locator('[data-estado="listo"]').waitFor();
			});
		}
	});
}

test("el teclado elige movimiento y la lista de cambio", async ({ page }) => {
	await abrir(page, "e2e-a");
	await page.keyboard.press("c");
	await esperarFase(page, "cambio");
	await page.keyboard.press("Escape");
	await esperarFase(page, "menu");
	await page.keyboard.press("1");
	// tras el turno vuelve el menú, o la lista de cambio si cayó el activo
	await expect
		.poll(async () => (await estado(page)).fase)
		.toMatch(/^(menu|cambio)$/);
	expect((await estado(page)).mensajes.length).toBeGreaterThan(2);
});

const forzar = (p: Page, tipo: "fatal" | "ilegal") =>
	p.evaluate(`window.__santuario.combate.forzarFallo("${tipo}")`);
const elegirPrimero = (p: Page) =>
	p.evaluate("window.__santuario.combate.elegir({tipo:'movimiento',indice:0})");

const TEXTOS = {
	"es-ES": {
		titulo: "Error en el combate",
		cuerpo:
			"No se pudo continuar el combate. Vuelve a la lista e inténtalo de nuevo.",
	},
	"en-US": {
		titulo: "Battle error",
		cuerpo: "The battle could not continue. Go back to the list and try again.",
	},
} as const;

for (const idioma of ["es-ES", "en-US"] as const) {
	test.describe(`errores (${idioma})`, () => {
		test.use({ locale: idioma });

		test("fallo fatal: panel localizado y vuelta a la lista", async ({
			page,
		}) => {
			await abrir(page, "e2e-a");
			await forzar(page, "fatal");
			await elegirPrimero(page);
			await esperarFase(page, "error");
			const { error } = await estado(page);
			expect(error?.titulo).toBe(TEXTOS[idioma].titulo);
			expect(error?.cuerpo).toBe(TEXTOS[idioma].cuerpo);
			expect(error?.detalle).toContain("dejó de responder");
			await page.screenshot({
				path: `test-results/combate-error-${idioma}.png`,
			});
			await page.keyboard.press("Escape");
			await page.locator('[data-estado="listo"]').waitFor();
		});

		test("elección ilegal: no es fatal y vuelve el menú", async ({ page }) => {
			await abrir(page, "e2e-a");
			const antes = await estado(page);
			await forzar(page, "ilegal");
			await elegirPrimero(page);
			await esperarFase(page, "menu");
			const despues = await estado(page);
			expect(despues.error).toBeNull();
			expect(despues.peticion).toEqual(antes.peticion);
			await elegirPrimero(page); // y el combate sigue respondiendo
			await expect
				.poll(async () => (await estado(page)).mensajes.length)
				.toBeGreaterThan(antes.mensajes.length);
		});
	});
}

test("cualquier tecla o clic salta el mensaje en curso (tiempos reales)", async ({
	page,
}) => {
	await page.goto("/?test=1&semilla=e2e-a&pausas=reales");
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("b");
	const n = async () => (await estado(page)).mensajes?.length ?? 0;
	await expect.poll(n, { intervals: [30] }).toBe(1);
	// la pausa natural es de 900 ms: avanzar antes solo puede ser por el salto
	await page.keyboard.press("Space");
	await expect.poll(n, { timeout: 600, intervals: [30] }).toBe(2);
	await page.mouse.click(480, 100);
	await expect.poll(n, { timeout: 600, intervals: [30] }).toBeGreaterThan(2);
});

/** Detiene la petición del chunk del Worker hasta llamar a `soltar`. */
async function retenerWorker(page: Page) {
	let soltar = () => {};
	const puerta = new Promise<void>((r) => {
		soltar = r;
	});
	await page.route(/worker-.*\.js/, async (route) => {
		await puerta;
		await route.continue();
	});
	return soltar;
}

test("Esc durante la carga vuelve a la lista y no arranca ningún combate", async ({
	page,
}) => {
	const soltar = await retenerWorker(page);
	await page.goto("/?test=1&semilla=e2e-a");
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("b");
	// la escena de combate está viva y sigue cargando (el Worker está retenido)
	await page.locator('[data-estado="combate"]').waitFor();
	await esperarFase(page, "cargando");
	await page.keyboard.press("Escape");
	await page.locator('[data-estado="listo"]').waitFor();
	const respuesta = page.waitForResponse(/worker-.*\.js/);
	soltar();
	await respuesta;
	// unos fotogramas después, la lista sigue ahí y no hay combate
	await page.waitForFunction(
		() =>
			new Promise<boolean>((ok) => {
				let n = 0;
				const f = () => (++n >= 60 ? ok(true) : requestAnimationFrame(f));
				f();
			}),
	);
	expect((await estado(page)).fase).toBe("sin-gancho");
	await expect(page.locator('[data-estado="listo"]')).toHaveCount(1);
});

test("carga diferida: el Worker y el simulador solo se piden al combatir", async ({
	page,
}) => {
	const urls: string[] = [];
	page.on("request", (r) => urls.push(r.url()));
	await page.goto("/?test=1");
	await page.locator('[data-estado="listo"]').waitFor();
	// asentamiento determinista: 120 fotogramas y un instante de reposo; si algo pidiera
	// el Worker o el simulador por su cuenta (precarga, temporizador), ya se habría visto
	await page.evaluate(
		() =>
			new Promise<void>((ok) => {
				let n = 0;
				const f = () =>
					++n >= 120
						? "requestIdleCallback" in window
							? requestIdleCallback(() => ok())
							: ok()
						: requestAnimationFrame(f);
				requestAnimationFrame(f);
			}),
	);
	expect(urls.filter((u) => /worker-.*\.js|pkmn/.test(u))).toEqual([]);
	await page.keyboard.press("b");
	await expect.poll(() => urls.some((u) => /worker-.*\.js/.test(u))).toBe(true);
	await esperarFase(page, "menu");
});

for (const idioma of ["es-ES", "en-US"] as const) {
	test.describe(`Worker real caído (${idioma})`, () => {
		test.use({ locale: idioma });

		test("panel de error localizado y vuelta a la lista", async ({ page }) => {
			await page.route(/worker-.*\.js/, (r) => r.fulfill({ status: 404 }));
			await page.goto("/?test=1&semilla=e2e-a");
			await page.locator('[data-estado="listo"]').waitFor();
			await page.keyboard.press("b");
			await esperarFase(page, "error");
			const { error } = await estado(page);
			expect(error?.titulo).toBe(TEXTOS[idioma].titulo);
			expect(error?.cuerpo).toBe(TEXTOS[idioma].cuerpo);
			await page.keyboard.press("Escape");
			await page.locator('[data-estado="listo"]').waitFor();
		});
	});
}

test("Esc en el menú principal abandona el combate y no deja errores", async ({
	page,
}) => {
	await abrir(page, "e2e-a");
	await page.keyboard.press("Escape");
	await page.locator('[data-estado="listo"]').waitFor();
	// teclas posteriores no tocan un combate muerto (el afterEach exige cero errores)
	for (const k of ["1", "c", "Escape"]) await page.keyboard.press(k);
	await page.waitForTimeout(300);
	expect(await page.evaluate("window.__santuario.combate === undefined")).toBe(
		true,
	);
});
