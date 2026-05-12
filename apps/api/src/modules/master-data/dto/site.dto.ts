import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CURRENCY_SCALE } from '@gravel/shared-types';

/**
 * GeoJSON Point payload exchanged with the API.
 *  - `coordinates` is `[longitude, latitude]` per RFC 7946 (NOT lat,lng).
 *  - SRID is always 4326 in the database.
 */
export class GeoJsonPointDto {
  @IsIn(['Point'])
  type!: 'Point';

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  coordinates!: [number, number];
}

const ALLOWED_CURRENCIES = Object.keys(CURRENCY_SCALE);

/**
 * D-24 Site fields. Inputs are validated against the IANA tz database and
 * the CURRENCY_SCALE registry. PostGIS geometry is provided as GeoJSON.
 */
export class CreateSiteDto {
  @IsUUID()
  countryId!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9-_]{3,30}$/, {
    message: 'code must be 3-30 chars [a-zA-Z0-9-_]',
  })
  code!: string;

  @IsString()
  name!: string;

  @IsString()
  ianaTimezone!: string;

  @IsString()
  @IsIn(ALLOWED_CURRENCIES, {
    message: `functionalCurrency must be one of [${ALLOWED_CURRENCIES.join(', ')}]`,
  })
  functionalCurrency!: string;

  @ValidateNested()
  @Type(() => GeoJsonPointDto)
  gpsPoint!: GeoJsonPointDto;

  @IsOptional()
  @IsUUID()
  managerUserId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  capacityTPerDay?: number;
}

export class UpdateSiteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  ianaTimezone?: string;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_CURRENCIES)
  functionalCurrency?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeoJsonPointDto)
  gpsPoint?: GeoJsonPointDto;

  @IsOptional()
  @IsUUID()
  managerUserId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  capacityTPerDay?: number;
}

export class ListSitesQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  includeArchived?: 'true' | 'false';
}
