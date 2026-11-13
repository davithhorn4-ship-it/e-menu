import { ApiProperty } from '@nestjs/swagger';

export class SuccessMetaDto {
  @ApiProperty({
    example: '/auth/me',
    description: 'Resolved request path for the successful response.',
  })
  path!: string;

  @ApiProperty({
    example: '2026-11-13T05:12:16.000Z',
    description: 'Response timestamp (ISO 8601, UTC).',
  })
  timestamp!: string;
}

export class EmptySuccessResponseDto {
  @ApiProperty({
    example: true,
    description: 'Always true for successful responses',
  })
  success!: true;

  @ApiProperty({
    example: null,
    type: Object,
    nullable: true,
    description: 'Empty success payload',
  })
  data!: null;

  @ApiProperty({
    type: () => SuccessMetaDto,
    description: 'Success response metadata added by the global interceptor.',
  })
  meta!: SuccessMetaDto;
}
