import { expect, type Page, test } from "@playwright/test";

type Estado = {
	fase: string;
	peticion: {
		movimientos: { deshabilitado: boolean }[];
		equipo: { activo: boolean; debilitado: boolean }[];
	} | null;
	terminado: string | null;
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

/** Juega hasta el final eligiendo siempre el primer movimiento o cambio posible. */
async function jugarHastaElFinal(p: Page) {
	for (let i = 0; i < 100; i++) {
		const s = await estado(p);
		if (s.fase === "fin") return;
		if (s.fase === "menu" || s.fase === "cambio") {
			const e =
				s.fase === "menu"
					? {
							tipo: "movimiento",
							indice:
								s.peticion?.movimientos.findIndex((m) => !m.deshabilitado) ?? 0,
						}
					: {
							tipo: "cambio",
							indice:
								s.peticion?.equipo.findIndex(
									(m) => !m.activo && !m.debilitado,
								) ?? 0,
						};
			await p.evaluate(
				`window.__santuario.combate.elegir(${JSON.stringify(e)})`,
			);
		} else await p.waitForTimeout(50);
	}
	throw new Error("el combate no terminó");
}

async function abrir(page: Page, semilla: string) {
	await page.goto(`/?test=1&semilla=${semilla}`);
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("b");
	await esperarFase(page, "menu");
}

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

test("combate completo, vuelta a la lista y determinismo por semilla", async ({
	page,
}) => {
	await abrir(page, "e2e-a");
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
	expect((await estado(page)).mensajes.length).toBeGreaterThan(0);

	await jugarHastaElFinal(page);
	const fin = await estado(page);
	expect(fin.terminado).not.toBeNull();
	const hash = await page.evaluate("window.__santuario.combate.registroHash()");
	expect(hash).toMatch(/^[0-9a-f]{64}$/);

	// misma semilla y mismas elecciones: mismo registro
	await page.keyboard.press("Escape");
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("b");
	await esperarFase(page, "menu");
	await jugarHastaElFinal(page);
	expect(await page.evaluate("window.__santuario.combate.registroHash()")).toBe(
		hash,
	);

	// semilla distinta: registro distinto
	await abrir(page, "e2e-b");
	await jugarHastaElFinal(page);
	expect(
		await page.evaluate("window.__santuario.combate.registroHash()"),
	).not.toBe(hash);
});

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

test("Esc durante la carga vuelve a la lista", async ({ page }) => {
	await page.goto("/?test=1&semilla=e2e-a");
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("b");
	await page.keyboard.press("Escape");
	await page.locator('[data-estado="listo"]').waitFor();
});
