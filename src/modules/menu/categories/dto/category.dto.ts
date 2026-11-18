import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Trim text before validating (" Coffee " → "Coffee"). */
const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/** Validate the raw JSON value: implicit conversion would turn "false" into true. */
const Raw = () =>
  Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key],
  );

export class CreateCategoryDto {
  @ApiProperty({ example: 'Coffee', maxLength: 80 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: 'កាហ្វេ', maxLength: 80, default: '' })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nameKm?: string;

  @ApiPropertyOptional({
    example: 0,
    minimum: 0,
    description:
      'Position on the menu (0 = first). Default: after the last category.',
  })
  @Raw()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  sortOrder?: number;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Hidden from the guest menu when false.',
  })
  @Raw()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Every field optional; send only what changes. */
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class ListCategoriesQueryDto {
  @ApiPropertyOptional({
    example: 'coffee',
    description: 'Matches the English or Khmer name (case-insensitive)',
  })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    return raw === 'true' ? true : raw === 'false' ? false : raw;
  })
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderCategoriesDto {
  @ApiProperty({
    type: [String],
    example: [
      '6f1c2b1e-1d2a-4c3b-9a8e-111111111111',
      '6f1c2b1e-1d2a-4c3b-9a8e-222222222222',
    ],
    description:
      'Category ids in their new order (first = top of the menu). Ids not listed keep their position.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}
