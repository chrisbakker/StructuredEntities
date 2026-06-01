import esbuild from "esbuild";
import sveltePlugin from "esbuild-svelte";
import sveltePreprocess from "svelte-preprocess";
import { copyFileSync, mkdirSync } from "fs";
import { VAULT_PLUGIN_DIR } from "./vault.config.mjs";

const prod = process.argv[2] === "production";

// Ensure vault plugin directory exists and copy manifest
mkdirSync(VAULT_PLUGIN_DIR, { recursive: true });
copyFileSync("manifest.json", `${VAULT_PLUGIN_DIR}/manifest.json`);
copyFileSync("styles.css", `${VAULT_PLUGIN_DIR}/styles.css`);

const EXTERNAL = ["obsidian", "electron", "@codemirror/*", "@lezer/*", "node:*"];

// ── Main plugin ───────────────────────────────────────────────────────────────
// Views are independent projects under views/*/ and are built separately.
// Run `npm run build:views` or `npm run build:all` to include them.
const mainContext = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: EXTERNAL,
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: `${VAULT_PLUGIN_DIR}/main.js`,
  minify: prod,
  plugins: [
    sveltePlugin({
      preprocess: sveltePreprocess(),
      compilerOptions: { css: "injected" },
    }),
  ],
});

if (prod) {
  await mainContext.rebuild();
  process.exit(0);
} else {
  await mainContext.watch();
  console.log("Watching for changes…");
}
