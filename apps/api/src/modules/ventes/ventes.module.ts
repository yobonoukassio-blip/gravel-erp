import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity';
import { SaleContract } from './entities/sale-contract.entity';
import { BonDeLivraison } from './entities/bon-de-livraison.entity';
import { FxRateSnapshot } from './entities/fx-rate-snapshot.entity';
import { CustomsDossier } from './entities/customs-dossier.entity';
import { Invoice } from './entities/invoice.entity';
import { BonDeLivraisonService } from './services/bon-de-livraison.service';
import { FxRateSnapshotService } from './services/fx-rate-snapshot.service';
import { InvoiceService } from './services/invoice.service';
import { VentesController } from './controllers/ventes.controller';

/**
 * VentesModule (Phase 3 W2 P05 + W3 P06).
 *
 * IMPORTANT: This module MUST NOT import StockpileModule.
 * BL signature emits 'production.vte.bl_signed' event; StockpileModule
 * consumes it via @OnEvent and creates STOCKPILE_OUTFLOW_SALE.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      SaleContract,
      BonDeLivraison,
      FxRateSnapshot,
      CustomsDossier,
      Invoice,
    ]),
    EventEmitterModule,
  ],
  controllers: [VentesController],
  providers: [BonDeLivraisonService, FxRateSnapshotService, InvoiceService],
  exports: [BonDeLivraisonService, FxRateSnapshotService, InvoiceService],
})
export class VentesModule {}
