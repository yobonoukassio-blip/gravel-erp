/**
 * ConflictRegistry — per-entity sync conflict policy mapping (D-11, D-12).
 *
 * Phase-1 scope: only `daily_activity_log` (append_only_event) and
 * `user_preferences` (last_write_wins) are wired end-to-end. The framework
 * is future-proofed for all 4 strategies — adding an entity in a later phase
 * is one line plus an entity-specific handler.
 *
 * Source: D-11 (sync engine), D-12 (Phase-1 sync surface).
 */
import type { ConflictPolicy, ConflictStrategy } from '@gravel/shared-types';

export type SyncEntityName = 'daily_activity_log' | 'user_preferences';

export const ConflictRegistry: Readonly<Record<SyncEntityName, ConflictPolicy>> = Object.freeze({
  daily_activity_log: { strategy: 'append_only_event' },
  user_preferences: { strategy: 'last_write_wins' },
});

export function getPolicy(entity: string): ConflictPolicy | undefined {
  return (ConflictRegistry as Record<string, ConflictPolicy>)[entity];
}

export function listEntities(): SyncEntityName[] {
  return Object.keys(ConflictRegistry) as SyncEntityName[];
}

export function listStrategiesInUse(): ConflictStrategy[] {
  const seen = new Set<ConflictStrategy>();
  for (const entity of listEntities()) {
    seen.add(ConflictRegistry[entity].strategy);
  }
  return [...seen];
}

/**
 * Marker decorator stub — future codegen will register entities via this.
 * Kept intentionally inert in Phase 1 (D-12 scope discipline).
 */
export function SyncEntity(_policy: ConflictPolicy): ClassDecorator {
  return (_target) => {
    /* no-op in Phase 1 */
  };
}
