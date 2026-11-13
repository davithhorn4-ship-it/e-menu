import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { RequirePermissions } from 'src/common/decorators/require-permissions.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import {
  PermissionListResponseDto,
  RoleListResponseDto,
  RolePermissionsResponseDto,
  SetRolePermissionsDto,
} from './dto/permissions.dto';
import { PermissionsService } from './permissions.service';
import { ADMIN_ROLES } from 'src/common/roles/role-groups';

const roleParam = new ParseEnumPipe(Role);

@ApiTags('permissions')
@ApiBearerAuth('bearer')
@ApiCookieAuth('accessToken')
@Controller()
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get('permissions')
  @Roles(...ADMIN_ROLES)
  @RequirePermissions('menu.role_permissions')
  @ApiOperation({ summary: 'Permission catalog (admin)' })
  @ApiOkResponse({ type: PermissionListResponseDto })
  @ApiForbiddenResponse({ description: 'INSUFFICIENT_ROLE' })
  async list() {
    return { success: true, data: await this.permissions.listPermissions() };
  }

  @Get('roles')
  @Roles(...ADMIN_ROLES)
  @RequirePermissions('menu.role_permissions')
  @ApiOperation({
    summary: 'Every role with its permission keys, user count and lock (admin)',
  })
  @ApiOkResponse({ type: RoleListResponseDto })
  @ApiForbiddenResponse({ description: 'INSUFFICIENT_ROLE' })
  async roles() {
    return { success: true, data: await this.permissions.listRoles() };
  }

  @Get('roles/:role/permissions')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: "A role's permission keys (admin)" })
  @ApiParam({ name: 'role', enum: Role })
  @ApiOkResponse({ type: RolePermissionsResponseDto })
  @ApiBadRequestResponse({ description: 'Unknown role' })
  @ApiForbiddenResponse({ description: 'INSUFFICIENT_ROLE' })
  async get(@Param('role', roleParam) role: Role) {
    return {
      success: true,
      data: {
        role,
        permissions: await this.permissions.getRolePermissions(role),
      },
    };
  }

  @Put('roles/:role/permissions')
  @Roles(...ADMIN_ROLES)
  @RequirePermissions('menu.role_permissions')
  @ApiOperation({
    summary: "Replace a role's permission keys (admin)",
    description:
      'Takes effect at once on this API instance (cache invalidated); other instances pick it up within 60 seconds.',
  })
  @ApiParam({ name: 'role', enum: Role })
  @ApiOkResponse({ type: RolePermissionsResponseDto })
  @ApiBadRequestResponse({
    description:
      'Unknown role, UNKNOWN_PERMISSION, ROLE_LOCKED (ADMIN), or ADMIN_ONLY_PERMISSION (menu.role_permissions for a non-admin role)',
  })
  @ApiForbiddenResponse({ description: 'INSUFFICIENT_ROLE' })
  async set(
    @Param('role', roleParam) role: Role,
    @Body() dto: SetRolePermissionsDto,
  ) {
    return {
      success: true,
      data: {
        role,
        permissions: await this.permissions.setRolePermissions(
          role,
          dto.permissions,
        ),
      },
    };
  }

  @Get('auth/me/permissions')
  @ApiTags('authentication')
  @ApiOperation({
    summary: "The signed-in user's role and permission keys",
    description:
      'Includes the sidebar menu keys (menu.*): the frontend shows a menu only when its key is listed.',
  })
  @ApiOkResponse({ type: RolePermissionsResponseDto })
  async mine(@Req() req: AuthRequest) {
    const role = req.user?.role;
    if (!req.user?.userId || !role) {
      throw new UnauthorizedException({
        code: 'ACCESS_TOKEN_REQUIRED',
        message: 'Access token is required',
      });
    }
    return {
      success: true,
      data: {
        role,
        permissions: await this.permissions.getRolePermissions(role),
      },
    };
  }
}
