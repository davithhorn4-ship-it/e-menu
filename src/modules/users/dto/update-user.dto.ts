import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { CreateUserDto } from './create-user.dto';

/** Every field optional; the password changes only through PUT /users/:id/password. */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password', 'phone', 'photoUrl'] as const),
) {
  @ApiPropertyOptional({
    example: '+85512345678',
    nullable: true,
    description: 'null clears it',
  })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/u/dara.png',
    nullable: true,
    description: 'null clears it',
  })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  photoUrl?: string | null;
}
