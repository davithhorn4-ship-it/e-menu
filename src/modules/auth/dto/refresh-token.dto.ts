import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body of POST /auth/refresh and POST /auth/logout. Browsers send the
 * refreshToken cookie and leave the body empty; clients without cookies
 * (mobile, scripts) send the token here instead.
 */
export class RefreshTokenDto {
  @ApiPropertyOptional({
    description:
      'Refresh token. Optional when the refreshToken cookie is sent; the body wins when both are present.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  // Validate the raw value: implicit conversion would turn an object into
  // the string "[object Object]".
  @Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key],
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  refreshToken?: string;
}
