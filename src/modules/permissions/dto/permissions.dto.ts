import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetRolePermissionsDto {
  @ApiProperty({
    type: [String],
    example: ['user.view', 'user.create', 'menu.dashboard'],
    description:
      'The full set of permission keys for the role. Keys not listed are removed. Unknown keys are refused (UNKNOWN_PERMISSION).',
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions!: string[];
}

export class PermissionDto {
  @ApiProperty({ example: 'user.view' })
  key!: string;

  @ApiProperty({ example: 'user' })
  group!: string;

  @ApiProperty({ example: 'View users' })
  description!: string;
}

export class PermissionListResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: [PermissionDto] })
  data!: PermissionDto[];
}

export class RolePermissionsDto {
  @ApiProperty({ enum: Role, example: Role.MANAGER })
  role!: Role;

  @ApiProperty({ type: [String], example: ['user.view', 'user.create'] })
  permissions!: string[];
}

export class RoleSummaryDto extends RolePermissionsDto {
  @ApiProperty({ example: 12, description: 'Users who hold this role' })
  userCount!: number;

  @ApiProperty({
    example: false,
    description: 'Locked roles always hold every permission (ADMIN, DEVELOPER)',
  })
  locked!: boolean;
}

export class RolePermissionsResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: RolePermissionsDto })
  data!: RolePermissionsDto;
}

export class RoleListResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: [RoleSummaryDto] })
  data!: RoleSummaryDto[];
}
