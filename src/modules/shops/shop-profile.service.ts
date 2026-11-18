import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { LocalFileStorage } from 'src/common/storage/local-file-storage';
import { detectPhotoType, MAX_PHOTO_BYTES } from 'src/modules/users/user-photo';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateShopProfileDto } from './dto/update-shop-profile.dto';
import { ShopContextService } from './shop-context.service';

const PROFILE_SELECT = {
  id: true,
  name: true,
  nameKm: true,
  logoUrl: true,
  defaultLanguage: true,
  baseCurrency: true,
  showSecondCurrency: true,
  exchangeRate: true,
  taxPercent: true,
  servicePercent: true,
  pricesIncludeTax: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ShopSelect;

type ProfileRow = Prisma.ShopGetPayload<{ select: typeof PROFILE_SELECT }>;

/** The shop profile as JSON: percentages are plain numbers, not Decimal strings. */
export type ShopProfile = Omit<ProfileRow, 'taxPercent' | 'servicePercent'> & {
  taxPercent: number;
  servicePercent: number;
};

const toProfile = (row: ProfileRow): ShopProfile => ({
  ...row,
  taxPercent: row.taxPercent.toNumber(),
  servicePercent: row.servicePercent.toNumber(),
});

/** Name, logo, language and money settings of the current shop. */
@Injectable()
export class ShopProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: ShopContextService,
    private readonly storage: LocalFileStorage,
  ) {}

  async get(): Promise<ShopProfile> {
    return toProfile(await this.row());
  }

  async update(dto: UpdateShopProfileDto): Promise<ShopProfile> {
    const current = await this.row();
    const logoChanged =
      dto.logoUrl !== undefined && dto.logoUrl !== current.logoUrl;
    // Keeping the current logo (the form sends it back) is always fine; a new
    // value must be an outside link. Uploaded files only come from PUT /logo.
    if (logoChanged && dto.logoUrl && !/^https?:\/\/\S+$/i.test(dto.logoUrl)) {
      throw new BadRequestException({
        code: 'LOGO_URL_INVALID',
        message:
          'logoUrl must be an http(s) link. To use a file, upload it with PUT /shop/profile/logo.',
      });
    }

    const row = await this.prisma.shop.update({
      where: { id: current.id },
      data: {
        name: dto.name,
        nameKm: dto.nameKm,
        defaultLanguage: dto.defaultLanguage,
        baseCurrency: dto.baseCurrency,
        showSecondCurrency: dto.showSecondCurrency,
        exchangeRate: dto.exchangeRate,
        taxPercent: dto.taxPercent,
        servicePercent: dto.servicePercent,
        pricesIncludeTax: dto.pricesIncludeTax,
        ...(logoChanged ? { logoUrl: dto.logoUrl } : {}),
      },
      select: PROFILE_SELECT,
    });
    if (logoChanged) await this.storage.remove(current.logoUrl);
    return toProfile(row);
  }

  /** Stores an uploaded logo (JPEG, PNG or WebP, max 2 MB); the type comes from the bytes. */
  async setLogo(file: { buffer?: Buffer } | undefined): Promise<ShopProfile> {
    const bytes = file?.buffer;
    if (!bytes?.length) {
      throw new BadRequestException({
        code: 'LOGO_REQUIRED',
        message: 'Send the image as multipart/form-data in the "file" field.',
      });
    }
    if (bytes.length > MAX_PHOTO_BYTES) {
      throw new PayloadTooLargeException({
        code: 'LOGO_TOO_LARGE',
        message: 'The logo must be 2 MB or smaller.',
      });
    }
    const type = detectPhotoType(bytes);
    if (!type) {
      throw new UnsupportedMediaTypeException({
        code: 'LOGO_TYPE_NOT_ALLOWED',
        message: 'Upload a JPEG, PNG or WebP image.',
      });
    }

    const current = await this.row();
    const url = await this.storage.save('shops', bytes, type);
    let row: ProfileRow;
    try {
      row = await this.prisma.shop.update({
        where: { id: current.id },
        data: { logoUrl: url },
        select: PROFILE_SELECT,
      });
    } catch (error) {
      await this.storage.remove(url);
      throw error;
    }
    await this.storage.remove(current.logoUrl);
    return toProfile(row);
  }

  /** Clears the logo and deletes the uploaded file. */
  async removeLogo(): Promise<ShopProfile> {
    const current = await this.row();
    const row = await this.prisma.shop.update({
      where: { id: current.id },
      data: { logoUrl: null },
      select: PROFILE_SELECT,
    });
    await this.storage.remove(current.logoUrl);
    return toProfile(row);
  }

  private async row(): Promise<ProfileRow> {
    const id = await this.shops.currentShopId();
    return this.prisma.shop.findUniqueOrThrow({
      where: { id },
      select: PROFILE_SELECT,
    });
  }
}
