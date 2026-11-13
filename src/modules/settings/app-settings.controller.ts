import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RequirePermissions } from 'src/common/decorators/require-permissions.decorator';
import type { AuthRequest } from 'src/common/types/auth-request.type';
import { AppSettingsService } from './app-settings.service';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';

@ApiTags('settings')
@ApiBearerAuth('bearer')
@ApiCookieAuth('accessToken')
@Controller('settings')
export class AppSettingsController {
  constructor(private readonly settings: AppSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'App settings (any signed-in user)' })
  @ApiOkResponse({ description: 'App settings returned successfully' })
  async get() {
    return { success: true, data: await this.settings.get() };
  }

  @Patch()
  @RequirePermissions('settings.edit')
  @ApiOperation({ summary: 'Update app settings' })
  @ApiOkResponse({ description: 'App settings updated' })
  @ApiForbiddenResponse({ description: 'INSUFFICIENT_PERMISSION' })
  async update(@Body() dto: UpdateAppSettingsDto, @Req() req: AuthRequest) {
    return {
      success: true,
      data: await this.settings.update(dto, req.user!.userId),
    };
  }
}
