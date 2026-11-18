import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

import { CreateUserDto } from './create-user.dto';
import { EmptyToNull } from './empty-to-null';

/** Every field optional; the password changes only through PUT /users/:id/password. */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password', 'phone', 'photoUrl'] as const),
) {
  @ApiPropertyOptional({
    example: '+85512345678',
    nullable: true,
    description: 'null or empty clears it',
  })
  @EmptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({
    example: '',
    nullable: true,
    description:
      'Optional link to an existing image; null or empty clears it. To upload a file use PUT /users/{id}/photo.',
  })
  @EmptyToNull()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  photoUrl?: string | null;
}
