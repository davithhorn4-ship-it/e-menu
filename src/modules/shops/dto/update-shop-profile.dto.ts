import { ApiPropertyOptional } from '@nestjs/swagger';
import { Currency, Locale } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { EmptyToNull } from 'src/modules/users/dto/empty-to-null';

/** Trim text before validating (" My Café " → "My Café"). */
const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/** Validate the raw JSON value: implicit conversion would turn "false" into true. */
const Raw = () =>
  Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key],
  );

/** Every field optional: send only what changes (the whole form also works). */
export class UpdateShopProfileDto {
  @ApiPropertyOptional({ example: 'My Restaurant', maxLength: 120 })
  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'ហាងរបស់ខ្ញុំ', maxLength: 120 })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameKm?: string;

  @ApiPropertyOptional({
    example: '',
    maxLength: 500,
    nullable: true,
    description:
      'Empty or null removes the logo. A new value must be an http(s) link; ' +
      'the usual way is to upload a file with PUT /shop/profile/logo.',
  })
  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

  @ApiPropertyOptional({ enum: Locale, example: Locale.km })
  @IsOptional()
  @IsEnum(Locale)
  defaultLanguage?: Locale;

  @ApiPropertyOptional({
    enum: Currency,
    example: Currency.USD,
    description: 'Currency prices are entered in.',
  })
  @IsOptional()
  @IsEnum(Currency)
  baseCurrency?: Currency;

  @ApiPropertyOptional({
    example: true,
    description: 'The guest menu also shows the other currency.',
  })
  @Raw()
  @IsOptional()
  @IsBoolean()
  showSecondCurrency?: boolean;

  @ApiPropertyOptional({
    example: 4100,
    minimum: 1,
    description: 'Riel per 1 USD.',
  })
  @Raw()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  exchangeRate?: number;

  @ApiPropertyOptional({ example: 10, minimum: 0, maximum: 100 })
  @Raw()
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxPercent?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0, maximum: 100 })
  @Raw()
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  servicePercent?: number;

  @ApiPropertyOptional({
    example: false,
    description: 'true = menu prices already include tax.',
  })
  @Raw()
  @IsOptional()
  @IsBoolean()
  pricesIncludeTax?: boolean;
}
