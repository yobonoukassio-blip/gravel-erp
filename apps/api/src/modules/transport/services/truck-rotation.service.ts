import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ProductionEquipmentService } from '../../master-data/production-equipment.service';
import { OutboxService } from '../../outbox/outbox.service';
import { TruckRotation } from '../entities/truck-rotation.entity';
import { WeighingTicket } from '../entities/weighing-ticket.entity';

export interface CreateTruckRotationInput {
  tenantId: string;
  siteId: string;
  operationalDayId: string;
  truckEquipmentId?: string | null;
  driverId?: string | null;
  loadedAtBenchId: string;
  unloadedAtZoneId: string;
  materialType: 'granite_brut' | 'tout_venant' | 'sterile';
  weighingTicketId: string;
  loadedAtUtc: Date;
  createdBy: string;
}

export const ROTATION_COMPLETED_EVENT =
  'production.transport.rotation_completed';

@Injectable()
export class TruckRotationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly equipment: ProductionEquipmentService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Create a rotation. Loaded tonnage is sourced from the linked weighing
   * ticket (net_kg / 1000) — server never trusts client tonnage.
   */
  async create(input: CreateTruckRotationInput): Promise<TruckRotation> {
    return this.dataSource.transaction(async (manager) => {
      return this.createWithManager(input, manager);
    });
  }

  async createWithManager(
    input: CreateTruckRotationInput,
    manager: EntityManager,
  ): Promise<TruckRotation> {
    const ticketRepo = manager.getRepository(WeighingTicket);
    const ticket = await ticketRepo.findOne({
      where: { id: input.weighingTicketId, tenantId: input.tenantId },
    });
    if (!ticket) {
      throw new NotFoundException(
        `WeighingTicket ${input.weighingTicketId} not found`,
      );
    }

    if (input.truckEquipmentId) {
      await this.equipment.assertActive(input.truckEquipmentId, input.tenantId);
    }

    const tonnageT = (ticket.netKg ?? ticket.grossKg - ticket.tareKg) / 1000;
    const repo = manager.getRepository(TruckRotation);
    const row = repo.create({
      tenantId: input.tenantId,
      siteId: input.siteId,
      operationalDayId: input.operationalDayId,
      truckEquipmentId: input.truckEquipmentId ?? null,
      driverId: input.driverId ?? null,
      loadedAtBenchId: input.loadedAtBenchId,
      unloadedAtZoneId: input.unloadedAtZoneId,
      materialType: input.materialType,
      loadedTonnageT: tonnageT.toFixed(2),
      weighingTicketId: input.weighingTicketId,
      loadedAtUtc: input.loadedAtUtc,
      unloadedAtUtc: null,
      createdBy: input.createdBy,
    });
    return repo.save(row);
  }

  /**
   * TRP-03: assign a truck to an existing rotation. Validates that the
   * equipment is type=truck and status=active (D2-14).
   */
  async assignTruck(
    rotationId: string,
    tenantId: string,
    truckEquipmentId: string,
  ): Promise<TruckRotation> {
    const equipment = await this.equipment.findById(truckEquipmentId, tenantId);
    if (equipment.type !== 'truck') {
      throw new BadRequestException({
        code: 'EQUIPMENT_NOT_TRUCK',
        message: `Equipment ${equipment.code} is type='${equipment.type}', expected 'truck'`,
      });
    }
    await this.equipment.assertActive(truckEquipmentId, tenantId);

    const repo = this.dataSource.getRepository(TruckRotation);
    const rotation = await repo.findOne({
      where: { id: rotationId, tenantId },
    });
    if (!rotation) {
      throw new NotFoundException(`TruckRotation ${rotationId} not found`);
    }
    rotation.truckEquipmentId = truckEquipmentId;
    return repo.save(rotation);
  }

  /**
   * D2-35: complete a rotation. Sets `unloaded_at_utc` AND publishes the
   * `production.transport.rotation_completed` outbox event in the SAME tx.
   * P05 stockpile consumer materializes STOCKPILE_INFLOW from this event.
   *
   * Phase 8 (D-06): optionally accepts `kmTotalAfter` (truck odometer after unloading).
   * When provided, persisted on the row and included in the event payload so the
   * MeterUpdateHandler can denormalize odometer_km_current on production_equipment.
   */
  async complete(
    rotationId: string,
    tenantId: string,
    unloadedAtUtc: Date,
    kmTotalAfter?: string | null,
  ): Promise<TruckRotation> {
    return this.dataSource.transaction(async (manager) => {
      return this.completeWithManager(rotationId, tenantId, unloadedAtUtc, manager, kmTotalAfter);
    });
  }

  async completeWithManager(
    rotationId: string,
    tenantId: string,
    unloadedAtUtc: Date,
    manager: EntityManager,
    kmTotalAfter?: string | null,
  ): Promise<TruckRotation> {
    const repo = manager.getRepository(TruckRotation);
    const rotation = await repo.findOne({
      where: { id: rotationId, tenantId },
    });
    if (!rotation) {
      throw new NotFoundException(`TruckRotation ${rotationId} not found`);
    }
    if (rotation.unloadedAtUtc) {
      throw new BadRequestException({
        code: 'ROTATION_ALREADY_COMPLETED',
        message: `Rotation ${rotationId} already unloaded at ${rotation.unloadedAtUtc.toISOString()}`,
      });
    }
    if (unloadedAtUtc.getTime() < rotation.loadedAtUtc.getTime()) {
      throw new BadRequestException({
        code: 'INVALID_UNLOAD_TIME',
        message: 'unloaded_at_utc must be >= loaded_at_utc',
      });
    }

    rotation.unloadedAtUtc = unloadedAtUtc;
    if (kmTotalAfter != null) {
      rotation.kmTotalAfter = kmTotalAfter;
    }
    const saved = await repo.save(rotation);

    // Same-tx outbox publish (D2-35). P05 worker consumes this event.
    await this.outbox.publish({
      tenantId,
      aggregateType: 'truck_rotation',
      aggregateId: saved.id,
      eventType: ROTATION_COMPLETED_EVENT,
      payload: {
        tenant_id: tenantId,
        site_id: saved.siteId,
        rotation_id: saved.id,
        truck_equipment_id: saved.truckEquipmentId ?? null,
        weighing_ticket_id: saved.weighingTicketId,
        loaded_tonnage_t: saved.loadedTonnageT,
        material_type: saved.materialType,
        stockpile_id_target: saved.unloadedAtZoneId,
        operational_day_id: saved.operationalDayId,
        occurred_at_utc: unloadedAtUtc.toISOString(),
        km_total_after: saved.kmTotalAfter ?? null,
      },
      manager,
    });

    return saved;
  }

  async findById(id: string, tenantId: string): Promise<TruckRotation> {
    const repo = this.dataSource.getRepository(TruckRotation);
    const row = await repo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException(`TruckRotation ${id} not found`);
    return row;
  }

  async listForOperationalDay(
    operationalDayId: string,
    tenantId: string,
  ): Promise<TruckRotation[]> {
    const repo = this.dataSource.getRepository(TruckRotation);
    return repo.find({
      where: { tenantId, operationalDayId },
      order: { loadedAtUtc: 'ASC' },
    });
  }

  async listRecent(tenantId: string, limit = 200): Promise<TruckRotation[]> {
    const repo = this.dataSource.getRepository(TruckRotation);
    return repo.find({
      where: { tenantId },
      order: { loadedAtUtc: 'DESC' },
      take: limit,
    });
  }

  async listPendingDispatch(tenantId: string): Promise<TruckRotation[]> {
    // TRP-03: rotations with no truck yet assigned and not yet completed.
    const repo = this.dataSource.getRepository(TruckRotation);
    return repo
      .createQueryBuilder('r')
      .where('r.tenant_id = :tenantId', { tenantId })
      .andWhere('r.truck_equipment_id IS NULL')
      .andWhere('r.unloaded_at_utc IS NULL')
      .orderBy('r.loaded_at_utc', 'ASC')
      .getMany();
  }
}
