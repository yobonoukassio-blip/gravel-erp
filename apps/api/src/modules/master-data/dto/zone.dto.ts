import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * GeoJSON Polygon. `coordinates` is an array of linear rings; the first ring
 * is the exterior. Each position is `[longitude, latitude]` per RFC 7946.
 */
export class GeoJsonPolygonDto {
  @IsIn(['Polygon'])
  type!: 'Polygon';

  @IsArray()
  @ArrayMinSize(1)
  coordinates!: number[][][];
}

export class CreateZoneDto {
  @IsUUID()
  siteId!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9-_]{1,30}$/)
  code!: string;

  @IsString()
  name!: string;

  @ValidateNested()
  @Type(() => GeoJsonPolygonDto)
  geometry!: GeoJsonPolygonDto;
}

export class UpdateZoneDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeoJsonPolygonDto)
  geometry?: GeoJsonPolygonDto;
}
