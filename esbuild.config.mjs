import esbuild from "esbuild";
import sveltePlugin from "esbuild-svelte";
import sveltePreprocess from "svelte-preprocess";
import { copyFileSync, mkdirSync } from "fs";
import { VAULT_PLUGIN_DIR } from "./vault.config.mjs";

const prod = process.argv[2] === "production";

// Always output to local dist/ first; then copy to vault if reachable.
mkdirSync("dist", { recursive: true });

/** Post-build plugin: copies dist/main.js + assets to vault (skipped in CI). */
const deployPlugin = {
  name: "deploy-to-vault",
  setup(build) {
    build.onEnd(() => {
      try {
        mkdirSync(VAULT_PLUGIN_DIR, { recursive: true });
        copyFileSync("dist/main.js", `${VAULT_PLUGIN_DIR}/main.js`);
        copyFileSync("manifest.json", `${VAULT_PLUGIN_DIR}/manifest.json`);
        copyFileSync("styles.css", `${VAULT_PLUGIN_DIR}/styles.css`);
      } catch { /* vault may not exist in CI */ }
    });
  },
};

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
  outfile: "dist/main.js",
  minify: prod,
  plugins: [
    sveltePlugin({
      preprocess: sveltePreprocess(),
      compilerOptions: { css: "injected" },
    }),
    deployPlugin,
  ],
});

if (prod) {
  await mainContext.rebuild();
  process.exit(0);
} else {
  await mainContext.watch();
  console.log("Watching for changes…");
}
