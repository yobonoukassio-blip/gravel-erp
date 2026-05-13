import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { RosterSlot } from '../entities/shift-roster.entity';

export interface UpsertShiftRosterInput {
  tenantId: string;
  siteId: string;
  rosterDate: string;
  rosterSlots: RosterSlot[];
  /** Current version from the client. Server rejects with 409 if version mismatch. */
  version?: number;
}

export interface ShiftRosterRow {
  id: string;
  tenant_id: string;
  site_id: string;
  roster_date: string;
  roster_jsonb: RosterSlot[];
  version: number;
  created_at_utc: string;
  updated_at_utc: string;
}

/**
 * ShiftRosterService (RH-03) — pessimistic_lock strategy.
 *
 * Upsert pattern: create if not exists, update with version check if exists.
 * Server rejects PUT with 409 CONFLICT if the provided version doesn't match
 * the stored version (concurrent edit detection).
 */
@Injectable()
export class ShiftRosterService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async upsert(input: UpsertShiftRosterInput): Promise<ShiftRosterRow> {
    const existing = await this.findByDate(input.tenantId, input.siteId, input.rosterDate);

    if (!existing) {
      // Create new roster
      const rows = (await this.ds.query(
        `INSERT INTO shift_roster (tenant_id, site_id, roster_date, roster_jsonb)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [input.tenantId, input.siteId, input.rosterDate, JSON.stringify(input.rosterSlots)],
      )) as ShiftRosterRow[];
      return rows[0];
    }

    // Version check
    if (input.version !== undefined && input.version !== existing.version) {
      throw new ConflictException({
        code: 'SHIFT_ROSTER_VERSION_CONFLICT',
        message: `Version conflict: expected ${existing.version}, received ${input.version}.`,
        current_version: existing.version,
      });
    }

    const rows = (await this.ds.query(
      `UPDATE shift_roster
          SET roster_jsonb = $1
        WHERE id = $2 AND tenant_id = $3
        RETURNING *`,
      [JSON.stringify(input.rosterSlots), existing.id, input.tenantId],
    )) as ShiftRosterRow[];

    return rows[0];
  }

  async findById(id: string, tenantId: string): Promise<ShiftRosterRow> {
    const rows = (await this.ds.query(
      `SELECT * FROM shift_roster WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )) as ShiftRosterRow[];

    if (rows.length === 0) {
      throw new NotFoundException({ code: 'SHIFT_ROSTER_NOT_FOUND' });
    }
    return rows[0];
  }

  async findByDate(
    tenantId: string,
    siteId: string,
    rosterDate: string,
  ): Promise<ShiftRosterRow | null> {
    const rows = (await this.ds.query(
      `SELECT * FROM shift_roster WHERE tenant_id = $1 AND site_id = $2 AND roster_date = $3`,
      [tenantId, siteId, rosterDate],
    )) as ShiftRosterRow[];

    return rows[0] ?? null;
  }

  async listForWeek(
    tenantId: string,
    siteId: string,
    weekStartDate: string,
  ): Promise<ShiftRosterRow[]> {
    return (await this.ds.query(
      `SELECT * FROM shift_roster
        WHERE tenant_id = $1 AND site_id = $2
          AND roster_date >= $3::date
          AND roster_date < ($3::date + INTERVAL '7 days')
        ORDER BY roster_date`,
      [tenantId, siteId, weekStartDate],
    )) as ShiftRosterRow[];
  }
}
