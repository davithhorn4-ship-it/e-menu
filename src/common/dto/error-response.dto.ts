import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ErrorBodyDto {
  @ApiProperty({
    example: 'AUTH_UNAUTHORIZED',
    description: 'Application-specific error code',
  })
  code!: string;

  @ApiProperty({
    example: 'Access token is required',
    description: 'Human-readable error message',
  })
  message!: string;

  @ApiProperty({
    example: 'UnauthorizedException',
    description: 'Normalized error type',
  })
  type!: string;

  @ApiPropertyOptional({
    description: 'Optional error details returned outside production',
    example: ['email must be an email'],
  })
  details?: unknown;
}

class ErrorMetaDto {
  @ApiProperty({
    example: 401,
    description: 'HTTP status code',
  })
  statusCode!: number;

  @ApiProperty({
    example: '2026-03-30T10:00:00.000Z',
    description: 'Response timestamp in ISO format',
  })
  timestamp!: string;

  @ApiProperty({
    example: '/auth/me',
    description: 'Request path',
  })
  path!: string;

  @ApiPropertyOptional({
    example: 'req_123456',
    description: 'Optional request identifier',
  })
  requestId?: string;
}

export class ErrorResponseDto {
  @ApiProperty({
    example: false,
    description: 'Always false for error responses',
  })
  success!: false;

  @ApiProperty({
    type: () => ErrorBodyDto,
    description: 'Structured error payload',
  })
  error!: ErrorBodyDto;

  @ApiProperty({
    type: () => ErrorMetaDto,
    description: 'Response metadata',
  })
  meta!: ErrorMetaDto;
}
