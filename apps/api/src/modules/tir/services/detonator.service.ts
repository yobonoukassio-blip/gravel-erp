import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Detonator, DetonatorStatus } from '../entities/detonator.entity';

/**
 * DetonatorService — TIR-02.
 *
 * Manages detonator serial lifecycle: IN_STOCK → LOADED → FIRED | RETURNED.
 * Any status → DESTROYED (disposal).
 */
@Injectable()
export class DetonatorService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async receiveFromEvent(
    serialNumber: string,
    receivedInEventId: string,
    tenantId: string,
  ): Promise<Detonator> {
    const rows = (await this.ds.query(
      `INSERT INTO detonator (tenant_id, serial_number, status, received_in_event_id)
       VALUES ($1, $2, 'IN_STOCK', $3)
       RETURNING *`,
      [tenantId, serialNumber, receivedInEventId],
    )) as Array<Record<string, unknown>>;
    return this.mapRow(rows[0]);
  }

  async load(serialNumber: string, blastChargeId: string, tenantId: string): Promise<Detonator> {
    const det = await this.findBySerial(serialNumber, tenantId);
    this.assertStatus(det, 'IN_STOCK', 'load');
    const rows = (await this.ds.query(
      `UPDATE detonator SET status = 'LOADED', blast_charge_id = $1
        WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [blastChargeId, det.id, tenantId],
    )) as Array<Record<string, unknown>>;
    return this.mapRow(rows[0]);
  }

  async fire(serialNumber: string, tenantId: string): Promise<Detonator> {
    const det = await this.findBySerial(serialNumber, tenantId);
    this.assertStatus(det, 'LOADED', 'fire');
    const rows = (await this.ds.query(
      `UPDATE detonator SET status = 'FIRED'
        WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [det.id, tenantId],
    )) as Array<Record<string, unknown>>;
    return this.mapRow(rows[0]);
  }

  async return(serialNumber: string, tenantId: string): Promise<Detonator> {
    const det = await this.findBySerial(serialNumber, tenantId);
    this.assertStatus(det, 'LOADED', 'return');
    const rows = (await this.ds.query(
      `UPDATE detonator SET status = 'RETURNED'
        WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [det.id, tenantId],
    )) as Array<Record<string, unknown>>;
    return this.mapRow(rows[0]);
  }

  async destroy(serialNumber: string, tenantId: string): Promise<Detonator> {
    const det = await this.findBySerial(serialNumber, tenantId);
    if (det.status === 'FIRED') {
      throw new UnprocessableEntityException({
        code: 'ERR_DETONATOR_FIRED_FINAL',
        message: 'FIRED detonators are in a terminal state and cannot be transitioned.',
      });
    }
    const rows = (await this.ds.query(
      `UPDATE detonator SET status = 'DESTROYED', destroyed_at_utc = now()
        WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [det.id, tenantId],
    )) as Array<Record<string, unknown>>;
    return this.mapRow(rows[0]);
  }

  async findBySerial(serialNumber: string, tenantId: string): Promise<Detonator> {
    const rows = (await this.ds.query(
      `SELECT * FROM detonator WHERE serial_number = $1 AND tenant_id = $2 LIMIT 1`,
      [serialNumber, tenantId],
    )) as Array<Record<string, unknown>>;
    if (rows.length === 0) {
      throw new NotFoundException({ code: 'ERR_DETONATOR_NOT_FOUND', serialNumber });
    }
    return this.mapRow(rows[0]);
  }

  private assertStatus(det: Detonator, required: DetonatorStatus, op: string): void {
    if (det.status !== required) {
      throw new UnprocessableEntityException({
        code: 'ERR_DETONATOR_INVALID_TRANSITION',
        message: `Cannot ${op} detonator with status=${det.status}; expected ${required}.`,
      });
    }
  }

  private mapRow(r: Record<string, unknown>): Detonator {
    return {
      id: r['id'] as string,
      tenantId: r['tenant_id'] as string,
      serialNumber: r['serial_number'] as string,
      status: r['status'] as DetonatorStatus,
      receivedInEventId: r['received_in_event_id'] as string,
      blastChargeId: (r['blast_charge_id'] as string | null) ?? null,
      destroyedAtUtc: r['destroyed_at_utc'] ? new Date(r['destroyed_at_utc'] as string) : null,
      createdAtUtc: new Date(r['created_at_utc'] as string | Date),
    };
  }
}
