import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../entities/customer.entity';
import { SaleContract } from '../entities/sale-contract.entity';
import { BonDeLivraison } from '../entities/bon-de-livraison.entity';
import { Invoice } from '../entities/invoice.entity';
import { BonDeLivraisonService } from '../services/bon-de-livraison.service';
import { InvoiceService } from '../services/invoice.service';

interface AuthedRequest {
  user: { userId: string; tenantId: string };
}

/** Ventes REST endpoints (Phase 3 VTE-01..VTE-04). */
@Controller('ventes')
export class VentesController {
  constructor(
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(SaleContract) private readonly contractRepo: Repository<SaleContract>,
    @InjectRepository(BonDeLivraison) private readonly blRepo: Repository<BonDeLivraison>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    private readonly blService: BonDeLivraisonService,
    private readonly invoiceService: InvoiceService,
  ) {}

  @Get('customers')
  listCustomers(@Req() req: AuthedRequest) {
    return this.customerRepo.find({
      where: { tenantId: req.user.tenantId },
      order: { name: 'ASC' },
    });
  }

  @Get('contracts')
  listContracts(
    @Query('customerId') customerId: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const qb = this.contractRepo
      .createQueryBuilder('sc')
      .where('sc.tenant_id = :tenantId', { tenantId: req.user.tenantId })
      .orderBy('sc.reference', 'ASC');
    if (customerId) qb.andWhere('sc.customer_id = :customerId', { customerId });
    return qb.getMany();
  }

  @Get('bl')
  listBLs(
    @Query('status') status: string | undefined,
    @Query('siteId') siteId: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const qb = this.blRepo
      .createQueryBuilder('bl')
      .where('bl.tenant_id = :tenantId', { tenantId: req.user.tenantId })
      .orderBy('bl.created_at', 'DESC')
      .limit(500);
    if (status) qb.andWhere('bl.status = :status', { status });
    if (siteId) qb.andWhere('bl.site_id = :siteId', { siteId });
    return qb.getMany();
  }

  @Get('invoices')
  listInvoices(
    @Query('customerId') customerId: string | undefined,
    @Query('status') status: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    const qb = this.invoiceRepo
      .createQueryBuilder('inv')
      .where('inv.tenant_id = :tenantId', { tenantId: req.user.tenantId })
      .orderBy('inv.issue_date', 'DESC')
      .limit(500);
    if (customerId) qb.andWhere('inv.customer_id = :customerId', { customerId });
    if (status) qb.andWhere('inv.status = :status', { status });
    return qb.getMany();
  }

  @Post('bl')
  createBL(
    @Body()
    body: {
      siteId: string;
      number: string;
      customerId: string;
      saleContractId: string;
      stockpileId: string;
      calibreCode: string;
      tonnageKg: number;
      deliveryDate: string;
      truckRotationId?: string;
      transporterId?: string;
    },
    @Req() req: AuthedRequest,
  ) {
    return this.blService.create({ ...body, tenantId: req.user.tenantId });
  }

  @Patch('bl/:id/sign')
  signBL(
    @Param('id') blId: string,
    @Body()
    body: {
      clientSignatureSha256: string;
      driverSignatureSha256: string;
      destinationCountry?: string;
    },
    @Req() req: AuthedRequest,
  ) {
    return this.blService.sign({ ...body, blId, tenantId: req.user.tenantId });
  }

  @Post('invoices/generate')
  generateInvoice(
    @Body()
    body: {
      customerId: string;
      blIds: string[];
      issueDate: string;
      pivotCurrency?: string;
    },
    @Req() req: AuthedRequest,
  ) {
    return this.invoiceService.generateForBLs({ ...body, tenantId: req.user.tenantId });
  }
}
