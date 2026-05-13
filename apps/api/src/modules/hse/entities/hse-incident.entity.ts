import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type HseCategory =
  | 'accident_personnel'
  | 'accident_materiel'
  | 'near_miss'
  | 'environnement'
  | 'securite'
  | 'autre';

export type HseIncidentStatus = 'open' | 'under_investigation' | 'closed';

export interface PersonImpacted {
  employee_id?: string;
  name?: string;
  injury_type?: string;
  body_part?: string;
  /** Hours of lost time. 0 means no lost time. */
  lost_time_h: number;
}

/**
 * HseIncident (D2-60, ADR-0008) — append-only incident record.
 *
 * Server rejects PATCH / DELETE at controller layer (405).
 * Each row carries a chain-of-hash (sha256) — see EventChainVerifier.
 *
 * Corrections to chronology generate a separate
 * HSE_INCIDENT_CHRONOLOGY_APPENDED row referencing original via
 * appends_to_incident_id — never an UPDATE.
 *
 * Chain: verified by EventChainVerifier.verifyChain('hse_incident', tenantId)
 */
@Entity({ name: 'hse_incident' })
@Index('hse_incident_tenant_time_idx', ['tenantId', 'occurredAtUtc'])
@Index('hse_incident_site_idx', ['siteId', 'occurredAtUtc'])
@Index('hse_incident_op_day_idx', ['operationalDayId'])
@Index('hse_incident_status_idx', ['tenantId', 'status'])
export class HseIncident {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  /** Local timestamp as reported on-site (no UTC normalisation applied yet). */
  @Column({ type: 'timestamp', name: 'occurred_at_local' })
  occurredAtLocal!: Date;

  @Column({ type: 'varchar', length: 64, name: 'iana_timezone' })
  ianaTimezone!: string;

  /** Server-computed from occurred_at_local + iana_timezone. */
  @Column({ type: 'timestamptz', name: 'occurred_at_utc' })
  occurredAtUtc!: Date;

  @Column({ type: 'uuid', name: 'operational_day_id' })
  operationalDayId!: string;

  @Column({
    type: 'enum',
    enum: [
      'accident_personnel',
      'accident_materiel',
      'near_miss',
      'environnement',
      'securite',
      'autre',
    ],
    name: 'category',
    enumName: 'hse_category',
  })
  category!: HseCategory;

  /** Severity 1 (minor) to 5 (fatal). */
  @Column({ type: 'int', name: 'severity' })
  severity!: number;

  @Column({ type: 'uuid', name: 'reporter_user_id' })
  reporterUserId!: string;

  @Column({ type: 'varchar', length: 500, name: 'location_text' })
  locationText!: string;

  /**
   * GPS point stored as text WKT or as PostGIS geography.
   * Nullable — remote sites without GPS submit location_text only.
   */
  @Column({ type: 'varchar', length: 100, name: 'gps_point', nullable: true })
  gpsPoint?: string | null;

  /** Array of PersonImpacted JSON objects. */
  @Column({ type: 'jsonb', name: 'people_impacted', default: () => "'[]'::jsonb" })
  peopleImpacted!: PersonImpacted[];

  /** UUIDs referencing equipment affected. */
  @Column({ type: 'simple-array', name: 'equipment_impacted_ids', default: '' })
  equipmentImpactedIds!: string[];

  /** Markdown narrative. Immutable after creation. */
  @Column({ type: 'text', name: 'chronology_md' })
  chronologyMd!: string;

  /**
   * SHA-256 hex keys referencing hse_attachment rows.
   * Stored here for canonical payload hashing (verifier needs it).
   */
  @Column({ type: 'simple-array', name: 'content_addressed_attachments', default: '' })
  contentAddressedAttachments!: string[];

  @Column({
    type: 'varchar',
    length: 30,
    name: 'status',
    default: 'open',
  })
  status!: HseIncidentStatus;

  @Column({ type: 'bytea', name: 'prev_hash' })
  prevHash!: Buffer;

  @Column({ type: 'bytea', name: 'row_hash' })
  rowHash!: Buffer;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at_utc' })
  createdAtUtc!: Date;
}
