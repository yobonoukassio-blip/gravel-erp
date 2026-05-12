import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * UserPreference — last_write_wins sync replica row.
 *
 * NOTE: canonical user-locale source-of-truth lives in `users.preferred_locale`
 * (owned by W2-P04). This replica row is the LWW sync target for arbitrary
 * preference keys (UI prefs, mobile flags) and the propagated mirror of the
 * locale field reconciled via CDC. Both endpoints coexist by design.
 *
 * Conflict resolution: row with the latest `server_received_at` wins.
 */
@Entity({ name: 'user_preferences' })
@Index('up_received_idx', ['serverReceivedAt'])
export class UserPreference {
  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @PrimaryColumn({ type: 'text' })
  key!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'jsonb' })
  value!: unknown;

  @Column({ type: 'text', name: 'client_id' })
  clientId!: string;

  @Column({ type: 'bigint', name: 'client_seq' })
  clientSeq!: string;

  @Column({ type: 'timestamptz', name: 'server_received_at' })
  serverReceivedAt!: Date;

  @Column({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
