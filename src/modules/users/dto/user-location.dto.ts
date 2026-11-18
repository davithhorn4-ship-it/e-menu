import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Validate the raw JSON value: implicit conversion would turn null into 0. */
const raw = () =>
  Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key],
  );

/**
 * Address and map position of a user. IsOptional skips null/undefined, so
 * "latitude and longitude together" is enforced by UsersService
 * (LOCATION_INCOMPLETE) and by a CHECK constraint in the database.
 */
export class UserLocationDto {
  @ApiPropertyOptional({
    example: 'St. 271, Sangkat Tuol Tumpung, Phnom Penh',
    maxLength: 300,
    nullable: true,
    description: 'Free-text address. null or "" clears it.',
  })
  @raw()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @ApiPropertyOptional({
    example: 11.5564,
    minimum: -90,
    maximum: 90,
    nullable: true,
    description:
      'Map latitude (WGS 84). Send with longitude; null clears both.',
  })
  @raw()
  @IsOptional()
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 7 },
    {
      message:
        'latitude must be a number; send latitude and longitude together',
    },
  )
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({
    example: 104.9282,
    minimum: -180,
    maximum: 180,
    nullable: true,
    description:
      'Map longitude (WGS 84). Send with latitude; null clears both.',
  })
  @raw()
  @IsOptional()
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 7 },
    {
      message:
        'longitude must be a number; send latitude and longitude together',
    },
  )
  @Min(-180)
  @Max(180)
  longitude?: number | null;
}
