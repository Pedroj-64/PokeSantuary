import { expect, type Page, test } from "@playwright/test";

type EstadoEleccion = {
	fase: string;
	evento: string;
	opciones: number;
	dinero: number;
	equipo: number[];
	runas: string[];
};

const eleccion = (p: Page) =>
	p.evaluate(
		"window.__santuario.eleccion?.estado() ?? null",
	) as Promise<EstadoEleccion | null>;

// Abre el mapa y salta a un nodo de elección del tipo pedido.
async function abrirNodo(page: Page, tipo: string) {
	await page.goto("/?test=1&semilla=m2");
	await page.locator('[data-estado="listo"]').waitFor();
	await page.keyboard.press("e");
	await expect
		.poll(() => page.evaluate("window.__santuario.mapa?.nodos().length ?? 0"))
		.toBeGreaterThan(0);
	const id = (await page.evaluate(
		`window.__santuario.mapa.nodos().find((n) => n.tipo === ${JSON.stringify(tipo)})?.id ?? null`,
	)) as string | null;
	expect(id, `el mapa de m2 no tiene un nodo ${tipo}`).not.toBeNull();
	await page.evaluate(`window.__santuario.mapa.irA(${JSON.stringify(id)})`);
	await expect.poll(async () => (await eleccion(page))?.fase).toBe("opciones");
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

test("el cofre da monedas al elegir la opción 1 y vuelve al mapa con Enter", async ({
	page,
}) => {
	await abrirNodo(page, "cofre");
	const antes = (await eleccion(page)) as EstadoEleccion;
	expect(antes.evento).toBe("cofre");
	expect(antes.opciones).toBeGreaterThanOrEqual(2);

	await page.keyboard.press("1");
	await expect.poll(async () => (await eleccion(page))?.fase).toBe("resultado");
	expect(((await eleccion(page)) as EstadoEleccion).dinero).toBeGreaterThan(
		antes.dinero,
	);

	await page.keyboard.press("Enter");
	await expect
		.poll(() => page.evaluate("window.__santuario.mapa?.estado().piso ?? 0"))
		.toBe(1);
});

test("el manantial permite elegir la runa y la guarda en la mochila", async ({
	page,
}) => {
	await abrirNodo(page, "manantial");
	await page.keyboard.press("2");
	await expect.poll(async () => (await eleccion(page))?.fase).toBe("resultado");
	expect(((await eleccion(page)) as EstadoEleccion).runas).toHaveLength(1);
});
