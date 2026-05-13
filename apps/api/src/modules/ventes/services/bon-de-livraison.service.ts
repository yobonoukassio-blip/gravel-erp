import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { BonDeLivraison } from '../entities/bon-de-livraison.entity';
import { SaleContract } from '../entities/sale-contract.entity';
import { CustomsDossier } from '../entities/customs-dossier.entity';

interface CreateBlDto {
  tenantId: string;
  siteId: string;
  number: string; // offline-generated SITE-YYYYMMDD-SEQ
  customerId: string;
  saleContractId: string;
  stockpileId: string;
  calibreCode: string;
  tonnageKg: number;
  truckRotationId?: string;
  transporterId?: string;
  deliveryDate: string;
}

interface SignBlDto {
  tenantId: string;
  blId: string;
  clientSignatureSha256: string;
  driverSignatureSha256: string;
  destinationCountry?: string;
}

/**
 * BonDeLivraisonService (VTE-03).
 *
 * VteModule MUST NOT import StockpileModule directly — integration via outbox event
 * `production.vte.bl_signed`. StockpileModule consumes and creates STOCKPILE_OUTFLOW_SALE.
 *
 * BL becomes immutable once status=SIGNED (DB trigger).
 * Dual signature SHA-256: both client + driver hashes required.
 * For export contracts (sale_contract.is_export=true), a CustomsDossier is auto-created.
 */
@Injectable()
export class BonDeLivraisonService {
  private readonly logger = new Logger(BonDeLivraisonService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  async create(dto: CreateBlDto): Promise<BonDeLivraison> {
    return this.ds.transaction(async (manager) => {
      const contract = await manager.findOne(SaleContract, {
        where: { id: dto.saleContractId, tenantId: dto.tenantId },
      });
      if (!contract) throw new NotFoundException(`sale_contract ${dto.saleContractId} not found`);

      const bl = manager.create(BonDeLivraison, {
        tenantId: dto.tenantId,
        siteId: dto.siteId,
        number: dto.number,
        customerId: dto.customerId,
        saleContractId: dto.saleContractId,
        stockpileId: dto.stockpileId,
        calibreCode: dto.calibreCode,
        tonnageKg: dto.tonnageKg.toFixed(3),
        truckRotationId: dto.truckRotationId ?? null,
        transporterId: dto.transporterId ?? null,
        deliveryDate: dto.deliveryDate,
        status: 'draft',
      });
      return manager.save(bl);
    });
  }

  async sign(dto: SignBlDto): Promise<BonDeLivraison> {
    if (!/^[0-9a-f]{64}$/i.test(dto.clientSignatureSha256)) {
      throw new BadRequestException('client_signature_sha256 must be 64 hex chars');
    }
    if (!/^[0-9a-f]{64}$/i.test(dto.driverSignatureSha256)) {
      throw new BadRequestException('driver_signature_sha256 must be 64 hex chars');
    }

    return this.ds.transaction(async (manager: EntityManager) => {
      const bl = await manager.findOne(BonDeLivraison, {
        where: { id: dto.blId, tenantId: dto.tenantId },
      });
      if (!bl) throw new NotFoundException(`bl ${dto.blId} not found`);
      if (bl.status === 'signed') {
        throw new BadRequestException('BL already signed (immutable)');
      }

      const contract = await manager.findOneOrFail(SaleContract, {
        where: { id: bl.saleContractId },
      });

      // Compute content hash freezing all material BL fields
      const canonical = JSON.stringify({
        number: bl.number,
        customer_id: bl.customerId,
        sale_contract_id: bl.saleContractId,
        stockpile_id: bl.stockpileId,
        calibre_code: bl.calibreCode,
        tonnage_kg: bl.tonnageKg,
        delivery_date: bl.deliveryDate,
        client_sig: dto.clientSignatureSha256,
        driver_sig: dto.driverSignatureSha256,
      });
      const contentHash = createHash('sha256').update(canonical).digest('hex');

      await manager.update(
        BonDeLivraison,
        { id: dto.blId },
        {
          status: 'signed',
          clientSignatureSha256: dto.clientSignatureSha256,
          driverSignatureSha256: dto.driverSignatureSha256,
          contentSha256: contentHash,
          signedAtUtc: new Date(),
        },
      );

      // VTE-06: Auto-create customs dossier for export contracts
      if (contract.isExport && dto.destinationCountry) {
        await manager.insert(CustomsDossier, {
          tenantId: dto.tenantId,
          blId: dto.blId,
          destinationCountry: dto.destinationCountry,
          status: 'pending',
        });
      }

      // Outbox event — StockpileModule consumes via @OnEvent (no direct import)
      this.events.emit('production.vte.bl_signed', {
        tenantId: dto.tenantId,
        blId: dto.blId,
        stockpileId: bl.stockpileId,
        calibreCode: bl.calibreCode,
        tonnageKg: bl.tonnageKg,
        contentSha256: contentHash,
        signedAtUtc: new Date().toISOString(),
      });

      return manager.findOneOrFail(BonDeLivraison, { where: { id: dto.blId } });
    });
  }
}
