import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO4217CurrencyCode,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateAppSettingsDto {
  @ApiPropertyOptional({ example: 'E-Menu', maxLength: 120 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  appName?: string;

  @ApiPropertyOptional({
    example: 'km',
    description: 'BCP 47 language tag, e.g. en, km, en-US',
  })
  @IsOptional()
  @Matches(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
  defaultLocale?: string;

  @ApiPropertyOptional({ example: 'USD', description: 'ISO 4217 code' })
  @IsOptional()
  @IsISO4217CurrencyCode()
  currency?: string;
}
