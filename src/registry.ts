import type { SvelteComponent } from "svelte";

type ViewComponent = typeof SvelteComponent;

const registry = new Map<string, ViewComponent>();

/** Register a Svelte component as the view for a given entity type. */
export function registerEntityView(
  type: string,
  component: ViewComponent
): void {
  registry.set(type, component);
}

/**
 * Look up the view component for an entity type.
 * Returns undefined if no specific view has been registered.
 */
export function getEntityView(type: string): ViewComponent | undefined {
  return registry.get(type);
}

/** Return all currently registered entity type names. */
export function getRegisteredTypes(): string[] {
  return Array.from(registry.keys());
}
