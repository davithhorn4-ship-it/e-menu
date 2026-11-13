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

export class CreateUserDto {
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

  @ApiPropertyOptional({ example: '+85512345678', maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/u/dara.png' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  photoUrl?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
