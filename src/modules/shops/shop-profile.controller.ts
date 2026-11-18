import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';

import { RequirePermissions } from 'src/common/decorators/require-permissions.decorator';
import { MAX_PHOTO_BYTES } from 'src/modules/users/user-photo';
import { UpdateShopProfileDto } from './dto/update-shop-profile.dto';
import { ShopProfileService } from './shop-profile.service';

@ApiTags('shop profile')
@ApiBearerAuth('bearer')
@ApiCookieAuth('accessToken')
@ApiForbiddenResponse({ description: 'INSUFFICIENT_PERMISSION' })
@ApiConflictResponse({ description: 'SHOP_NOT_SET_UP (run npm run db:seed)' })
@Controller('shop/profile')
export class ShopProfileController {
  constructor(private readonly profile: ShopProfileService) {}

  @Get()
  @RequirePermissions('shop.view')
  @ApiOperation({
    summary: 'Get the shop profile',
    description: 'Name, logo, default language, currencies, tax and service.',
  })
  @ApiOkResponse({ description: 'The shop profile' })
  async get() {
    return { success: true, data: await this.profile.get() };
  }

  @Patch()
  @RequirePermissions('shop.edit')
  @ApiOperation({ summary: 'Update the shop profile (send only what changes)' })
  @ApiOkResponse({ description: 'The updated shop profile' })
  @ApiBadRequestResponse({ description: 'Validation error, LOGO_URL_INVALID' })
  async update(@Body() dto: UpdateShopProfileDto) {
    return { success: true, data: await this.profile.update(dto) };
  }

  @Put('logo')
  @RequirePermissions('shop.edit')
  @UseInterceptors(
    // In memory only: the service checks the bytes before anything is saved.
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 0, parts: 1 },
    }),
  )
  @ApiOperation({
    summary: 'Upload the shop logo',
    description:
      'multipart/form-data with one "file" field: JPEG, PNG or WebP, max 2 MB. ' +
      'Replaces the previous logo and sets logoUrl to /uploads/shops/<random>.<ext>.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ description: 'The shop profile with its new logoUrl' })
  @ApiBadRequestResponse({ description: 'LOGO_REQUIRED' })
  @ApiPayloadTooLargeResponse({ description: 'LOGO_TOO_LARGE (over 2 MB)' })
  @ApiUnsupportedMediaTypeResponse({
    description: 'LOGO_TYPE_NOT_ALLOWED (not JPEG, PNG or WebP)',
  })
  async uploadLogo(@UploadedFile() file: Express.Multer.File | undefined) {
    return { success: true, data: await this.profile.setLogo(file) };
  }

  @Delete('logo')
  @RequirePermissions('shop.edit')
  @ApiOperation({ summary: 'Remove the shop logo' })
  async removeLogo() {
    return { success: true, data: await this.profile.removeLogo() };
  }
}
