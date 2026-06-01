import type { Entity } from "./types";

/** Set a top-level field value. Returns a new Entity (immutable). */
export function updateField(
  entity: Entity,
  key: string,
  value: unknown
): Entity {
  return { ...entity, fields: { ...entity.fields, [key]: value } };
}

/** Set a relationship field by entity ID. Returns a new Entity (immutable). */
export function updateRelation(
  entity: Entity,
  key: string,
  entityId: string
): Entity {
  return updateField(entity, key, entityId);
}

/** Replace the markdown body. Returns a new Entity (immutable). */
export function updateBody(entity: Entity, text: string): Entity {
  return { ...entity, body: text };
}
