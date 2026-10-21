import { expect, type Page, test } from "@playwright/test";

const SEIS = [
	"bulbasaur",
	"charmander",
	"squirtle",
	"pikachu",
	"zubat",
	"abra",
];

// Abre un combate salvaje de la entrada con las bolas y el equipo pedidos.
async function abrirSalvaje(page: Page, cambios: string) {
	await page.goto("/?test=1&semilla=m2");
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("e");
	await expect
		.poll(() => page.evaluate("window.__santuario.mapa?.nodos().length ?? 0"))
		.toBeGreaterThan(0);
	await page.evaluate(`window.__santuario.mapa.preparar(${cambios})`);
	await page.waitForTimeout(100);
	const id = (await page.evaluate(
		`(() => { const m = window.__santuario.mapa; return m.estado().elegibles.find((i) => m.tipoDe(i) === "salvaje") ?? null; })()`,
	)) as string | null;
	expect(id, "la entrada de m2 no tiene un salvaje").not.toBeNull();
	await page.evaluate(`window.__santuario.mapa.elegir(${JSON.stringify(id)})`);
	// Con más de 3 conscientes pide elegir quiénes combaten: los 3 primeros.
	if (
		await page.evaluate("window.__santuario.mapa?.alineacionAbierta() ?? false")
	) {
		for (let i = 0; i < 3; i++) {
			await page.keyboard.press("Enter");
			await page.keyboard.press("ArrowDown");
		}
		// Del cuarto a la fila «Combatir con estos».
		for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Enter");
	}
	await expect
		.poll(() =>
			page.evaluate("window.__santuario.combate?.estado().fase ?? null"),
		)
		.toBe("menu");
}

// Lanza bolas hasta que una entra y la escena pasa a Captura.
async function capturarHastaQueEntre(page: Page) {
	for (let i = 0; i < 40; i++) {
		if (await page.evaluate("window.__santuario.captura !== undefined")) return;
		const fase = await page.evaluate(
			"window.__santuario.combate?.estado().fase",
		);
		if (fase === "menu")
			await page.evaluate("window.__santuario.combate.lanzarBola()");
		await page.waitForTimeout(250);
	}
	throw new Error("ninguna bola entró en 40 intentos");
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

test("capturar un salvaje gasta bolas y suma al equipo", async ({ page }) => {
	await abrirSalvaje(page, `{ mochila: { "super-ball": 40 } }`);
	const rival = (await page.evaluate(
		"window.__santuario.combate.estado().rival",
	)) as string;
	await capturarHastaQueEntre(page);
	const c = (await page.evaluate("window.__santuario.captura.estado()")) as {
		especie: string;
		equipo: string[];
	};
	expect(c.especie).toBe(rival);
	expect(c.equipo).toHaveLength(4);
	expect(c.equipo[3]).toBe(rival);
	await page.keyboard.press("Enter");
	await expect
		.poll(() =>
			page.evaluate("window.__santuario.mapa?.estado().equipo.length ?? 0"),
		)
		.toBe(4);
	const mochila = (await page.evaluate(
		"window.__santuario.mapa.estado().mochila",
	)) as Record<string, number>;
	expect(mochila["super-ball"] ?? 0).toBeLessThan(40);
});

test("con el equipo lleno hay que elegir a quién soltar", async ({ page }) => {
	await abrirSalvaje(
		page,
		`{ mochila: { "super-ball": 40 }, equipo: ${JSON.stringify(SEIS)} }`,
	);
	const rival = (await page.evaluate(
		"window.__santuario.combate.estado().rival",
	)) as string;
	await capturarHastaQueEntre(page);
	const c = (await page.evaluate("window.__santuario.captura.estado()")) as {
		equipo: string[];
	};
	expect(c.equipo).toEqual(SEIS);
	await page.keyboard.press("2");
	await expect
		.poll(() =>
			page.evaluate("window.__santuario.mapa?.estado().especies ?? null"),
		)
		.not.toBeNull();
	const especies = (await page.evaluate(
		"window.__santuario.mapa.estado().especies",
	)) as string[];
	// el capturado ocupa el sitio del segundo y ese ya no está
	expect(especies).toEqual([SEIS[0], rival, ...SEIS.slice(2)]);
});
