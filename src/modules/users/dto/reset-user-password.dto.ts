import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetUserPasswordDto {
  @ApiProperty({
    example: 'NewStrongPass123',
    description: 'New user password',
    minLength: 8,
    maxLength: 200,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}
