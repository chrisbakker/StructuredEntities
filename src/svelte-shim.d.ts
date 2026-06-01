// Type shim so TypeScript understands .svelte imports.
// esbuild-svelte handles actual compilation; this only satisfies the type checker.
declare module "*.svelte" {
  import type { SvelteComponentTyped } from "svelte";
  const component: typeof SvelteComponentTyped;
  export default component;
}
