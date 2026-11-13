import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class AuthUserDto {
  @ApiProperty({ example: 'b5b3f9b9-5f19-47a4-b6f1-ef10254b2b5d' })
  id!: string;

  @ApiProperty({ example: 'Admin User' })
  fullName!: string;

  @ApiProperty({ example: 'admin@example.com' })
  email!: string;

  @ApiProperty({ example: '+85512345678', nullable: true })
  phone!: string | null;

  @ApiProperty({ example: null, nullable: true })
  photoUrl!: string | null;

  @ApiProperty({ enum: Role, example: Role.MANAGER })
  role!: Role;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-11-13T08:00:00.000Z', nullable: true })
  lastLoginAt!: Date | null;

  @ApiProperty({ example: '2026-11-13T08:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-13T08:00:00.000Z' })
  updatedAt!: Date;
}

class LoginDataDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken!: string;
}

export class LoginResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: () => LoginDataDto })
  data!: LoginDataDto;
}

class MeDataDto {
  @ApiProperty({ type: () => AuthUserDto })
  user!: AuthUserDto;
}

export class MeResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: () => MeDataDto })
  data!: MeDataDto;
}
