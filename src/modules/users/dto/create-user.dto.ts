import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

import { EmptyToNull } from './empty-to-null';
import { UserLocationDto } from './user-location.dto';

/** Location fields (address, latitude, longitude) come from UserLocationDto. */
export class CreateUserDto extends UserLocationDto {
  @ApiProperty({ example: 'Sok Dara', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ example: 'dara@example.com', maxLength: 120 })
  @IsEmail()
  @MaxLength(120)
  email!: string;

  @ApiProperty({ example: 'a-strong-password', minLength: 8, maxLength: 200 })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @ApiPropertyOptional({ enum: Role, default: Role.STAFF })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    example: '+85512345678',
    maxLength: 30,
    description: 'Optional. Empty = no phone.',
  })
  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({
    example: '',
    maxLength: 500,
    description:
      'Optional link to an existing image. Leave empty: the usual way is to upload a file with PUT /users/{id}/photo.',
  })
  @EmptyToNull()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  photoUrl?: string | null;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
