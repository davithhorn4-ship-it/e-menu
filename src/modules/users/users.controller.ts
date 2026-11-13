import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from 'src/common/decorators/require-permissions.decorator';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { type Actor, UsersService } from './users.service';

const actorOf = (req: AuthRequest): Actor => ({
  userId: req.user!.userId,
  role: req.user!.role,
});

/**
 * Each route needs its permission key (role_permissions). On top of that the
 * service refuses accounts the actor's role may not manage
 * (canManageUserRole: MANAGER manages STAFF only).
 */
@ApiTags('users')
@ApiBearerAuth('bearer')
@ApiCookieAuth('accessToken')
@ApiForbiddenResponse({
  description: 'INSUFFICIENT_PERMISSION or CANNOT_MANAGE_ROLE',
})
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('user.view')
  @ApiOperation({ summary: 'List users with pagination and filters' })
  @ApiOkResponse({ description: 'Users and pagination' })
  async list(@Query() query: ListUsersQueryDto) {
    return { success: true, data: await this.users.listUsers(query) };
  }

  @Get(':id')
  @RequirePermissions('user.view')
  @ApiOperation({ summary: 'Get one user' })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.users.findSafeById(id) };
  }

  @Post()
  @RequirePermissions('user.create')
  @ApiOperation({ summary: 'Create a user' })
  @ApiCreatedResponse({ description: 'User created' })
  @ApiConflictResponse({ description: 'EMAIL_TAKEN' })
  async create(@Body() dto: CreateUserDto, @Req() req: AuthRequest) {
    return {
      success: true,
      data: await this.users.createUser(dto, actorOf(req)),
    };
  }

  @Patch(':id')
  @RequirePermissions('user.edit')
  @ApiOperation({
    summary: 'Update a user',
    description:
      'Deactivating a user (isActive=false) signs them out on every device.',
  })
  @ApiBadRequestResponse({ description: 'CANNOT_CHANGE_OWN_ACCESS' })
  @ApiConflictResponse({ description: 'EMAIL_TAKEN' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      data: await this.users.updateUser(id, dto, actorOf(req)),
    };
  }

  @Put(':id/password')
  @RequirePermissions('user.edit')
  @ApiOperation({
    summary: "Reset a user's password",
    description: 'Ends every session of that user.',
  })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetUserPasswordDto,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      data: await this.users.resetPassword(id, dto, actorOf(req)),
    };
  }

  @Delete(':id')
  @RequirePermissions('user.delete')
  @ApiOperation({ summary: 'Delete a user' })
  @ApiBadRequestResponse({ description: 'CANNOT_DELETE_SELF' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      data: await this.users.deleteUser(id, actorOf(req)),
    };
  }
}
