import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GeoJsonPolygonDto } from './zone.dto';

export class CreateBenchDto {
  @IsUUID()
  productionZoneId!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9-_]{1,30}$/)
  code!: string;

  @IsString()
  name!: string;

  @ValidateNested()
  @Type(() => GeoJsonPolygonDto)
  geometry!: GeoJsonPolygonDto;

  @IsOptional()
  @IsNumber()
  elevationM?: number;
}

export class UpdateBenchDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeoJsonPolygonDto)
  geometry?: GeoJsonPolygonDto;

  @IsOptional()
  @IsNumber()
  elevationM?: number;
}
