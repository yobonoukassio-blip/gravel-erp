import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditChainVerifier } from './audit-chain.verifier';
import { AuditExportService } from './audit-export.service';
import { AuditExportController } from './audit-export.controller';
import { AuditExportCron } from './audit-export.cron';
import { Tenant } from '../tenancy/entities/tenant.entity';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog, Tenant]),
    NotificationModule,
  ],
  controllers: [AuditExportController],
  providers: [AuditChainVerifier, AuditExportService, AuditExportCron],
  exports: [AuditChainVerifier, AuditExportService, TypeOrmModule],
})
export class AuditModule {}
