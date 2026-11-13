import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';

const SETTINGS_ID = 1;

const settingsSelect = {
  appName: true,
  defaultLocale: true,
  currency: true,
  updatedAt: true,
} satisfies Prisma.AppSettingSelect;

/** Same values as the column defaults in prisma/schema.prisma. */
const DEFAULT_SETTINGS = {
  appName: 'E-Menu',
  defaultLocale: 'en',
  currency: 'USD',
  updatedAt: null,
};

@Injectable()
export class AppSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The settings row; defaults when it was never saved. */
  async get(client: Prisma.TransactionClient | PrismaService = this.prisma) {
    const row = await client.appSetting.findUnique({
      where: { id: SETTINGS_ID },
      select: settingsSelect,
    });
    return row ?? DEFAULT_SETTINGS;
  }

  async update(dto: UpdateAppSettingsDto, userId: string) {
    return this.prisma.appSetting.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...dto, updatedById: userId },
      update: { ...dto, updatedById: userId },
      select: settingsSelect,
    });
  }
}
