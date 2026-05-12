import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductionEquipmentService } from '../../master-data/production-equipment.service';
import { DrillingPlan, DrillingPlanStatus } from '../entities/drilling-plan.entity';

export interface CreateDrillingPlanInput {
  tenantId: string;
  siteId: string;
  zoneId: string;
  benchId: string;
  plannedHoleCount: number;
  targetDepthM: number;
  diameterMm: number;
  assignedOperatorId?: string | null;
  assignedMachineId?: string | null;
  validFrom: Date;
  validTo?: Date | null;
  createdBy: string;
}

export interface UpdateDrillingPlanInput {
  plannedHoleCount?: number;
  targetDepthM?: number;
  diameterMm?: number;
  assignedOperatorId?: string | null;
  assignedMachineId?: string | null;
  validFrom?: Date;
  validTo?: Date | null;
}

const ALLOWED_TRANSITIONS: Record<DrillingPlanStatus, DrillingPlanStatus[]> = {
  draft: ['active', 'archived'],
  active: ['closed'],
  closed: ['archived'],
  archived: [],
};

/**
 * DrillingPlanService — owns the state machine of drilling_plan rows.
 *
 * Critical rule (D2-14, FOR-05): `activate()` MUST call
 * `productionEquipmentService.assertActive()` for the assigned drill —
 * a foreuse en panne ne peut pas démarrer un plan.
 */
@Injectable()
export class DrillingPlanService {
  constructor(
    @InjectRepository(DrillingPlan)
    private readonly repo: Repository<DrillingPlan>,
    private readonly equipment: ProductionEquipmentService,
  ) {}

  async create(input: CreateDrillingPlanInput): Promise<DrillingPlan> {
    if (input.plannedHoleCount <= 0) {
      throw new BadRequestException('planned_hole_count must be > 0');
    }
    if (input.targetDepthM <= 0) {
      throw new BadRequestException('target_depth_m must be > 0');
    }
    if (input.diameterMm <= 0) {
      throw new BadRequestException('diameter_mm must be > 0');
    }
    const row = this.repo.create({
      tenantId: input.tenantId,
      siteId: input.siteId,
      zoneId: input.zoneId,
      benchId: input.benchId,
      plannedHoleCount: input.plannedHoleCount,
      targetDepthM: input.targetDepthM.toFixed(2),
      diameterMm: input.diameterMm,
      assignedOperatorId: input.assignedOperatorId ?? null,
      assignedMachineId: input.assignedMachineId ?? null,
      validFrom: input.validFrom,
      validTo: input.validTo ?? null,
      status: 'draft',
      createdBy: input.createdBy,
    });
    return this.repo.save(row);
  }

  async findById(id: string, tenantId: string): Promise<DrillingPlan> {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException(`DrillingPlan ${id} not found`);
    return row;
  }

  async findAll(tenantId: string, siteId?: string): Promise<DrillingPlan[]> {
    const where: Record<string, unknown> = { tenantId };
    if (siteId) where.siteId = siteId;
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  /**
   * Assign or change the machine on a draft plan. Rejects if equipment
   * is not active (D2-14 / FOR-05).
   */
  async assignMachine(
    planId: string,
    tenantId: string,
    machineId: string,
  ): Promise<DrillingPlan> {
    const plan = await this.findById(planId, tenantId);
    if (plan.status !== 'draft') {
      throw new BadRequestException({
        code: 'PLAN_NOT_DRAFT',
        message: 'Machine can only be assigned on draft plans',
      });
    }
    await this.equipment.assertActive(machineId, tenantId);
    plan.assignedMachineId = machineId;
    return this.repo.save(plan);
  }

  /**
   * FOR-05: activate fails ERR_EQUIPMENT_NOT_ACTIVE when assigned drill
   * status != 'active'.
   */
  async activate(planId: string, tenantId: string, _userId: string): Promise<DrillingPlan> {
    const plan = await this.findById(planId, tenantId);
    this.assertTransition(plan.status, 'active');
    if (!plan.assignedMachineId) {
      throw new BadRequestException({
        code: 'NO_MACHINE_ASSIGNED',
        message: 'Cannot activate plan without an assigned machine',
      });
    }
    // FOR-05 guard.
    await this.equipment.assertActive(plan.assignedMachineId, tenantId);
    plan.status = 'active';
    return this.repo.save(plan);
  }

  async closePlan(
    planId: string,
    tenantId: string,
    userId: string,
    isManager: boolean,
  ): Promise<DrillingPlan> {
    const plan = await this.findById(planId, tenantId);
    this.assertTransition(plan.status, 'closed');
    if (plan.createdBy !== userId && !isManager) {
      throw new ForbiddenException({
        code: 'NOT_PLAN_OWNER',
        message: 'Only the plan creator or a SITE_MANAGER may close this plan',
      });
    }
    plan.status = 'closed';
    plan.closedBy = userId;
    plan.closedAtUtc = new Date();
    return this.repo.save(plan);
  }

  async archive(planId: string, tenantId: string): Promise<DrillingPlan> {
    const plan = await this.findById(planId, tenantId);
    this.assertTransition(plan.status, 'archived');
    plan.status = 'archived';
    return this.repo.save(plan);
  }

  async update(
    planId: string,
    tenantId: string,
    input: UpdateDrillingPlanInput,
  ): Promise<DrillingPlan> {
    const plan = await this.findById(planId, tenantId);
    if (plan.status !== 'draft') {
      throw new BadRequestException('Only draft plans can be updated');
    }
    if (input.plannedHoleCount !== undefined) {
      plan.plannedHoleCount = input.plannedHoleCount;
    }
    if (input.targetDepthM !== undefined) {
      plan.targetDepthM = input.targetDepthM.toFixed(2);
    }
    if (input.diameterMm !== undefined) plan.diameterMm = input.diameterMm;
    if (input.assignedOperatorId !== undefined) {
      plan.assignedOperatorId = input.assignedOperatorId;
    }
    if (input.assignedMachineId !== undefined) {
      if (input.assignedMachineId) {
        await this.equipment.assertActive(input.assignedMachineId, tenantId);
      }
      plan.assignedMachineId = input.assignedMachineId;
    }
    if (input.validFrom !== undefined) plan.validFrom = input.validFrom;
    if (input.validTo !== undefined) plan.validTo = input.validTo;
    return this.repo.save(plan);
  }

  private assertTransition(
    from: DrillingPlanStatus,
    to: DrillingPlanStatus,
  ): void {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition drilling_plan from '${from}' to '${to}'`,
      });
    }
  }
}
