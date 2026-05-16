import {
  BadRequestException,
  Injectable,
  MethodNotAllowedException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DOWNTIME_REASON_VALUES,
  DowntimeReasonCode,
  ExtractionCycle,
  MATERIAL_TYPE_VALUES,
  MaterialType,
} from '../entities/extraction-cycle.entity';
import { ProductionEquipmentService } from '../../master-data/production-equipment.service';

export interface CreateExtractionCycleInput {
  tenantId: string;
  siteId: string;
  operationalDayId: string;
  benchId: string;
  equipmentId: string;
  operatorId: string;
  materialType: MaterialType;
  estimatedTonnageT: number;
  cycleStartedAtLocal: Date;
  cycleEndedAtLocal: Date;
  ianaTimezone: string;
  downtimeMinutes?: number | null;
  downtimeReasonCode?: DowntimeReasonCode | null;
  notes?: string | null;
  correctsId?: string | null;
  createdBy: string;
}

export interface ListExtractionCyclesInput {
  tenantId: string;
  operationalDayId?: string;
  equipmentId?: string;
  operatorId?: string;
}

@Injectable()
export class ExtractionCycleService {
  constructor(
    @InjectRepository(ExtractionCycle)
    private readonly repo: Repository<ExtractionCycle>,
    private readonly equipmentService: ProductionEquipmentService,
    private readonly events: EventEmitter2,
  ) {}

  async create(input: CreateExtractionCycleInput): Promise<ExtractionCycle> {
    this.validateInput(input);
    // Equipment must be active (D2-14) — same invariant as foration assign.
    await this.equipmentService.assertActive(input.equipmentId, input.tenantId);

    const row = this.repo.create({
      tenantId: input.tenantId,
      siteId: input.siteId,
      operationalDayId: input.operationalDayId,
      benchId: input.benchId,
      equipmentId: input.equipmentId,
      operatorId: input.operatorId,
      materialType: input.materialType,
      estimatedTonnageT: input.estimatedTonnageT,
      cycleStartedAtLocal: input.cycleStartedAtLocal,
      cycleEndedAtLocal: input.cycleEndedAtLocal,
      ianaTimezone: input.ianaTimezone,
      downtimeMinutes: input.downtimeMinutes ?? null,
      downtimeReasonCode: input.downtimeReasonCode ?? null,
      notes: input.notes ?? null,
      correctsId: input.correctsId ?? null,
      createdBy: input.createdBy,
    });
    const saved = await this.repo.save(row);

    // FIN-04: signal analytics writer so the cycle gets an analytical_entry
    // (extraction labor / downtime cost — booked at amount=0 until rates
    // are configured in the FIN-07 refinement sprint).
    this.events.emit('production.extraction.cycle_recorded', {
      tenantId: saved.tenantId,
      siteId: saved.siteId,
      cycleId: saved.id,
      operationalDayId: saved.operationalDayId,
      equipmentId: saved.equipmentId,
      operatorId: saved.operatorId,
      materialType: saved.materialType,
      estimatedTonnageT: saved.estimatedTonnageT,
      downtimeMinutes: saved.downtimeMinutes,
    });

    return saved;
  }

  async findById(id: string, tenantId: string): Promise<ExtractionCycle> {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException(`ExtractionCycle ${id} not found`);
    return row;
  }

  async list(input: ListExtractionCyclesInput): Promise<ExtractionCycle[]> {
    const where: Record<string, unknown> = { tenantId: input.tenantId };
    if (input.operationalDayId) where.operationalDayId = input.operationalDayId;
    if (input.equipmentId) where.equipmentId = input.equipmentId;
    if (input.operatorId) where.operatorId = input.operatorId;
    return this.repo.find({
      where,
      order: { cycleStartedAtLocal: 'ASC' },
    });
  }

  /**
   * Append-only invariant — surfaced as a Service method so controllers and
   * future event-handler paths share the same guard.
   */
  rejectMutation(): never {
    throw new MethodNotAllowedException({
      code: 'EXTRACTION_CYCLE_APPEND_ONLY',
      message:
        'ExtractionCycle is append-only (D2-20). Submit a correction row instead.',
    });
  }

  private validateInput(input: CreateExtractionCycleInput): void {
    if (!MATERIAL_TYPE_VALUES.includes(input.materialType)) {
      throw new BadRequestException(
        `Invalid material_type '${input.materialType}'`,
      );
    }
    if (
      input.downtimeReasonCode !== undefined &&
      input.downtimeReasonCode !== null &&
      !DOWNTIME_REASON_VALUES.includes(input.downtimeReasonCode)
    ) {
      throw new BadRequestException(
        `Invalid downtime_reason_code '${input.downtimeReasonCode}'`,
      );
    }
    if (input.estimatedTonnageT < 0) {
      throw new BadRequestException('estimated_tonnage_t must be >= 0');
    }
    if (
      input.cycleEndedAtLocal.getTime() <= input.cycleStartedAtLocal.getTime()
    ) {
      throw new BadRequestException(
        'cycle_ended_at_local must be strictly after cycle_started_at_local',
      );
    }
    if (input.downtimeMinutes != null && input.downtimeMinutes < 0) {
      throw new BadRequestException('downtime_minutes must be >= 0');
    }
    if (
      input.downtimeReasonCode != null &&
      (input.downtimeMinutes == null || input.downtimeMinutes <= 0)
    ) {
      throw new BadRequestException(
        'downtime_reason_code requires downtime_minutes > 0',
      );
    }
    const elapsedMinutes =
      (input.cycleEndedAtLocal.getTime() -
        input.cycleStartedAtLocal.getTime()) /
      60000;
    if (
      input.downtimeMinutes != null &&
      input.downtimeMinutes > elapsedMinutes
    ) {
      throw new BadRequestException(
        'downtime_minutes cannot exceed cycle elapsed time',
      );
    }
  }
}
