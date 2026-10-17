import { defineConfig, devices } from "@playwright/test";

const PUERTO = 4173;

export default defineConfig({
	testDir: "e2e",
	outputDir: "test-results",
	reporter: "list",
	use: {
		...devices["Desktop Chrome"],
		viewport: { width: 960, height: 540 },
		baseURL: `http://localhost:${PUERTO}`,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
	// compilación real + vista previa: más fiel que el servidor de desarrollo
	webServer: {
		command: `pnpm build && pnpm exec vite preview --port ${PUERTO} --strictPort`,
		url: `http://localhost:${PUERTO}`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
