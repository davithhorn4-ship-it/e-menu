import { ConflictException, Injectable } from '@nestjs/common';

import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Which shop (tenant) a request works on.
 *
 * Single-shop mode for now: the API serves one restaurant business, the
 * oldest active row in `shops` (created by `npm run db:seed`). When shop
 * membership is built (shop_members), resolve the shop from the signed-in
 * user here instead; every shop-scoped service already goes through this
 * one method, so nothing else has to change.
 */
@Injectable()
export class ShopContextService {
  private cached: { id: string; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async currentShopId(): Promise<string> {
    // The shop rarely changes; cache it briefly to save a query per request.
    if (this.cached && Date.now() - this.cached.at < 60_000) {
      return this.cached.id;
    }
    const shop = await this.prisma.shop.findFirst({
      where: { isActive: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (!shop) {
      this.cached = null;
      throw new ConflictException({
        code: 'SHOP_NOT_SET_UP',
        message: 'No shop is set up yet. Run "npm run db:seed" to create it.',
      });
    }
    this.cached = { id: shop.id, at: Date.now() };
    return shop.id;
  }
}
