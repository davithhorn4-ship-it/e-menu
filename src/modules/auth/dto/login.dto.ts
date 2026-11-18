import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'admin@example.com',
    description: 'User email address',
    maxLength: 120,
  })
  // Trim before validating, so " user@x.com " is accepted (the service
  // lowercases it).
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(120)
  email!: string;

  @ApiProperty({
    example: 'SuperAdmin123!',
    description: 'User password',
    minLength: 8,
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}
