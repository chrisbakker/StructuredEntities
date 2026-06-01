import esbuild from "esbuild";
import sveltePlugin from "esbuild-svelte";
import sveltePreprocess from "svelte-preprocess";
import { copyFileSync, mkdirSync } from "fs";
import { VAULT_PLUGIN_DIR } from "../../vault.config.mjs";

const prod = process.argv[2] === "production";
const VAULT_VIEW_DIR = `${VAULT_PLUGIN_DIR}/views/person`;

mkdirSync("dist", { recursive: true });
try {
  mkdirSync(VAULT_VIEW_DIR, { recursive: true });
} catch { /* vault may not exist in CI */ }

const EXTERNAL = ["obsidian", "electron", "@codemirror/*", "@lezer/*", "node:*"];

/** Copies dist/index.js to the vault after every build (prod and watch). */
const deployPlugin = {
  name: "deploy-to-vault",
  setup(build) {
    build.onEnd(() => {
      try {
        copyFileSync("dist/index.js", `${VAULT_VIEW_DIR}/index.js`);
      } catch { /* vault may not exist in CI */ }
    });
  },
};

const ctx = await esbuild.context({
  entryPoints: [{ in: "src/index.ts", out: "index" }],
  bundle: true,
  external: EXTERNAL,
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outdir: "dist",
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
  await ctx.rebuild();
  ctx.dispose();
  process.exit(0);
} else {
  await ctx.watch();
  console.log("Watching for changes…");
}
