import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ProductionEquipment } from './production-equipment.entity';
import {
  CreateEquipmentInput,
  ProductionEquipmentService,
  UpdateEquipmentInput,
} from './production-equipment.service';

interface AuthedRequest {
  user: { userId: string; tenantId: string };
}

interface CreateDto {
  site_id: string;
  code: string;
  label: string;
  type: 'drill' | 'excavator' | 'truck' | 'generator';
  specs?: Record<string, unknown>;
}

interface UpdateDto {
  label?: string;
  specs?: Record<string, unknown>;
}

interface StatusDto {
  status: 'active' | 'maintenance' | 'out_of_service';
}

@Controller('equipment')
export class ProductionEquipmentController {
  constructor(private readonly svc: ProductionEquipmentService) {}

  @Post()
  async create(
    @Req() req: AuthedRequest,
    @Body() body: CreateDto,
  ): Promise<ProductionEquipment> {
    const input: CreateEquipmentInput = {
      tenantId: req.user.tenantId,
      siteId: body.site_id,
      code: body.code,
      label: body.label,
      type: body.type,
      specs: body.specs,
    };
    return this.svc.create(input);
  }

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('site_id') siteId?: string,
  ): Promise<ProductionEquipment[]> {
    return this.svc.findAll(req.user.tenantId, siteId);
  }

  @Get(':id')
  async getOne(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
  ): Promise<ProductionEquipment> {
    return this.svc.findById(id, req.user.tenantId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Body() body: UpdateDto,
  ): Promise<ProductionEquipment> {
    const input: UpdateEquipmentInput = {
      label: body.label,
      specs: body.specs,
    };
    return this.svc.update(id, req.user.tenantId, input);
  }

  @Patch(':id/status')
  async setStatus(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Body() body: StatusDto,
  ): Promise<ProductionEquipment> {
    return this.svc.setStatus(id, req.user.tenantId, body.status);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
  ): Promise<void> {
    await this.svc.remove(id, req.user.tenantId);
  }
}
