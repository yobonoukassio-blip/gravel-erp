import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { SparePart } from '../entities/spare-part.entity';
import { SparePartConsumption } from '../entities/spare-part-consumption.entity';

/**
 * SparePartService (MNT-04).
 *
 * CRITICAL — consume() uses SELECT FOR UPDATE inside a transaction to prevent
 * negative stock under concurrent work-order writes. A CHECK constraint
 * (quantity_on_hand >= 0) provides defense-in-depth.
 */
@Injectable()
export class SparePartService {
  private readonly logger = new Logger(SparePartService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Atomically deduct `quantity` from a spare part's on-hand stock for a work order.
   * Throws BadRequestException if insufficient stock — never partially fulfills.
   * Emits `maintenance.spare_part.threshold_crossed` when crossing below threshold.
   */
  async consume(params: {
    tenantId: string;
    workOrderId: string;
    sparePartId: string;
    quantity: number;
  }): Promise<void> {
    const { tenantId, workOrderId, sparePartId, quantity } = params;
    if (quantity <= 0) {
      throw new BadRequestException('quantity must be > 0');
    }

    await this.ds.transaction(async (manager: EntityManager) => {
      const part = await manager
        .createQueryBuilder(SparePart, 'sp')
        .setLock('pessimistic_write')
        .where('sp.id = :id AND sp.tenant_id = :tenantId', { id: sparePartId, tenantId })
        .getOne();

      if (!part) {
        throw new BadRequestException(`spare_part ${sparePartId} not found`);
      }
      if (part.quantityOnHand < quantity) {
        throw new BadRequestException(
          `INSUFFICIENT_STOCK: have ${part.quantityOnHand}, need ${quantity}`,
        );
      }

      const newQuantity = part.quantityOnHand - quantity;
      const wasBelow = part.belowThreshold;
      const nowBelow =
        part.thresholdMin != null && newQuantity <= part.thresholdMin;

      await manager.update(
        SparePart,
        { id: sparePartId },
        { quantityOnHand: newQuantity, belowThreshold: nowBelow },
      );

      await manager.insert(SparePartConsumption, {
        tenantId,
        workOrderId,
        sparePartId,
        quantity,
      });

      // Edge-triggered alert — same pattern as STK-02 stockpile thresholds.
      if (!wasBelow && nowBelow) {
        this.events.emit('maintenance.spare_part.threshold_crossed', {
          tenantId,
          sparePartId,
          sku: part.sku,
          quantityOnHand: newQuantity,
          thresholdMin: part.thresholdMin,
        });
      }
    });
  }
}
