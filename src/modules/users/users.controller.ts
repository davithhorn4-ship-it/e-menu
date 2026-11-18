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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';

import { RequirePermissions } from 'src/common/decorators/require-permissions.decorator';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { MAX_PHOTO_BYTES } from './user-photo';
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

  @Put(':id/photo')
  @RequirePermissions('user.edit')
  @UseInterceptors(
    // In memory only: the service checks the bytes before anything is saved.
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 0, parts: 1 },
    }),
  )
  @ApiOperation({
    summary: "Upload a user's profile photo",
    description:
      'multipart/form-data with one "file" field: JPEG, PNG or WebP, max 2 MB. ' +
      'Replaces the previous photo and sets photoUrl to /uploads/users/<random>.<ext> ' +
      '(served by this API; prefix it with the API address).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ description: 'The updated user with its new photoUrl' })
  @ApiBadRequestResponse({ description: 'PHOTO_REQUIRED' })
  @ApiPayloadTooLargeResponse({ description: 'PHOTO_TOO_LARGE (over 2 MB)' })
  @ApiUnsupportedMediaTypeResponse({
    description: 'PHOTO_TYPE_NOT_ALLOWED (not JPEG, PNG or WebP)',
  })
  async uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      data: await this.users.setPhoto(id, file, actorOf(req)),
    };
  }

  @Delete(':id/photo')
  @RequirePermissions('user.edit')
  @ApiOperation({ summary: "Remove a user's profile photo" })
  async removePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return {
      success: true,
      data: await this.users.removePhoto(id, actorOf(req)),
    };
  }

  @Delete(':id')
  @RequirePermissions('user.delete')
  @ApiOperation({ summary: 'Delete a user' })
  @ApiBadRequestResponse({ description: 'CANNOT_DELETE_SELF' })
  @ApiConflictResponse({
    description: 'USER_HAS_SHOP_MEMBERSHIP: deactivate the user instead',
  })
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
