import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { BonDeLivraison } from '../entities/bon-de-livraison.entity';
import { SaleContract } from '../entities/sale-contract.entity';
import { FxRateSnapshotService } from './fx-rate-snapshot.service';

interface GenerateForBLsDto {
  tenantId: string;
  customerId: string;
  blIds: string[];
  issueDate: string;
  pivotCurrency?: string; // default XOF
}

/**
 * InvoiceService (VTE-04).
 *
 * generateForBLs():
 *   1. Pre-flight: list ALL missing FX dates BEFORE processing any BL.
 *      Fails entirely with `MISSING_FX_RATES` if any rate is missing — never partial.
 *   2. All money math in bigint minor units (dinero.js discipline).
 *   3. Invoice becomes immutable after status='sent'.
 *   4. Invoice number sequential per tenant via SELECT FOR UPDATE on counter row.
 */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly fx: FxRateSnapshotService,
  ) {}

  async generateForBLs(dto: GenerateForBLsDto): Promise<Invoice> {
    const pivot = dto.pivotCurrency ?? 'XOF';
    if (dto.blIds.length === 0) {
      throw new BadRequestException('blIds must contain at least one BL');
    }

    return this.ds.transaction(async (manager) => {
      const bls = await manager.find(BonDeLivraison, {
        where: dto.blIds.map((id) => ({ id, tenantId: dto.tenantId })),
      });
      if (bls.length !== dto.blIds.length) {
        throw new BadRequestException('Some BLs not found');
      }
      if (bls.some((bl) => bl.status !== 'signed')) {
        throw new BadRequestException('All BLs must be status=signed');
      }
      if (bls.some((bl) => bl.customerId !== dto.customerId)) {
        throw new BadRequestException('All BLs must belong to the same customer');
      }

      // Fetch contracts to determine line currency
      const contractIds = [...new Set(bls.map((bl) => bl.saleContractId))];
      const contracts = await manager.find(SaleContract, {
        where: contractIds.map((id) => ({ id })),
      });
      const contractMap = new Map(contracts.map((c) => [c.id, c]));

      const contractCurrencies = new Set(contracts.map((c) => c.currency));
      if (contractCurrencies.size > 1) {
        throw new BadRequestException('All BLs must share one contract currency');
      }
      const lineCurrency = [...contractCurrencies][0];

      // PRE-FLIGHT: collect unique delivery_dates and check ALL FX rates exist
      if (lineCurrency !== pivot) {
        const uniqueDates = [...new Set(bls.map((bl) => bl.deliveryDate))];
        const missing = await this.fx.listMissingForDates({
          tenantId: dto.tenantId,
          currencyFrom: lineCurrency,
          currencyTo: pivot,
          dates: uniqueDates,
        });
        if (missing.length > 0) {
          throw new BadRequestException(
            `MISSING_FX_RATES: ${lineCurrency}->${pivot} for ${missing.join(', ')}`,
          );
        }
      }

      // All math in bigint minor units
      let subtotalMinor = 0n;
      for (const bl of bls) {
        const contract = contractMap.get(bl.saleContractId)!;
        const tonnage = BigInt(Math.round(Number(bl.tonnageKg) * 1000)); // kg→g
        const unitPrice = BigInt(contract.unitPriceMinorUnits);
        // unit_price is per ton (minor units / t) → multiply by tonnage_kg / 1000
        const lineTotal = (unitPrice * tonnage) / 1_000_000n;
        subtotalMinor += lineTotal;
      }

      // FX conversion (using snapshot at first BL's date — sum-per-rate not modeled here)
      let totalXofMinor: bigint | null = null;
      let fxRate: string | null = null;
      if (lineCurrency !== pivot) {
        const firstBl = bls[0];
        const snap = await this.fx.findForDate({
          tenantId: dto.tenantId,
          currencyFrom: lineCurrency,
          currencyTo: pivot,
          snapshotDate: firstBl.deliveryDate,
        });
        if (!snap) throw new BadRequestException('FX rate disappeared mid-generation');
        fxRate = snap.rate;
        const rateScaled = BigInt(Math.round(Number(snap.rate) * 1e8));
        totalXofMinor = (subtotalMinor * rateScaled) / 100_000_000n;
      }

      // Sequential invoice number via counter
      const numberResult = await manager.query<Array<{ next_num: number }>>(
        `INSERT INTO invoice_counter (tenant_id, last_number)
         VALUES ($1, 1)
         ON CONFLICT (tenant_id) DO UPDATE SET last_number = invoice_counter.last_number + 1
         RETURNING last_number AS next_num`,
        [dto.tenantId],
      );
      const invoiceNumber = `INV-${new Date().getFullYear()}-${String(numberResult[0].next_num).padStart(6, '0')}`;

      const invoice = manager.create(Invoice, {
        tenantId: dto.tenantId,
        number: invoiceNumber,
        customerId: dto.customerId,
        blIds: dto.blIds,
        subtotalMinorUnits: subtotalMinor.toString(),
        totalMinorUnits: subtotalMinor.toString(),
        currency: lineCurrency,
        fxRateToXof: fxRate,
        totalXofMinorUnits: totalXofMinor != null ? totalXofMinor.toString() : null,
        issueDate: dto.issueDate,
        status: 'draft',
      });
      return manager.save(invoice);
    });
  }
}
