import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ShopContextService } from 'src/modules/shops/shop-context.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateCategoryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
} from './dto/category.dto';

/** Columns returned to clients (shop_id is implied by the request). */
export const CATEGORY_SELECT = {
  id: true,
  name: true,
  nameKm: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CategorySelect;

export type CategoryView = Prisma.CategoryGetPayload<{
  select: typeof CATEGORY_SELECT;
}>;

/** A shop keeps its menu small; this caps a single list response. */
const MAX_LIST = 500;

const notFound = () =>
  new NotFoundException({
    code: 'CATEGORY_NOT_FOUND',
    message: 'Category not found',
  });

const nameTaken = () =>
  new ConflictException({
    code: 'CATEGORY_NAME_TAKEN',
    message: 'Another category already has this name',
  });

/**
 * Menu categories of the current shop. Every query is scoped by shop_id, so
 * an id from another shop is answered as "not found" (no cross-shop access).
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: ShopContextService,
  ) {}

  async list(query: ListCategoriesQueryDto = {}): Promise<CategoryView[]> {
    const shopId = await this.shops.currentShopId();
    const search = query.search?.trim();
    return this.prisma.category.findMany({
      where: {
        shopId,
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { nameKm: { contains: search } },
              ],
            }
          : {}),
      },
      select: CATEGORY_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: MAX_LIST,
    });
  }

  async get(id: string): Promise<CategoryView> {
    const shopId = await this.shops.currentShopId();
    const category = await this.prisma.category.findFirst({
      where: { id, shopId },
      select: CATEGORY_SELECT,
    });
    if (!category) throw notFound();
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<CategoryView> {
    const shopId = await this.shops.currentShopId();
    await this.assertNameFree(shopId, dto.name);

    // Default position: after the last category.
    const sortOrder =
      dto.sortOrder ??
      ((
        await this.prisma.category.aggregate({
          where: { shopId },
          _max: { sortOrder: true },
        })
      )._max.sortOrder ?? -1) + 1;

    try {
      return await this.prisma.category.create({
        data: {
          shopId,
          name: dto.name,
          nameKm: dto.nameKm ?? '',
          sortOrder,
          isActive: dto.isActive ?? true,
        },
        select: CATEGORY_SELECT,
      });
    } catch (error) {
      throw mapUnique(error);
    }
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryView> {
    const current = await this.get(id);
    const shopId = await this.shops.currentShopId();
    if (dto.name !== undefined && dto.name !== current.name) {
      await this.assertNameFree(shopId, dto.name, id);
    }

    try {
      return await this.prisma.category.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.nameKm !== undefined ? { nameKm: dto.nameKm } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        select: CATEGORY_SELECT,
      });
    } catch (error) {
      throw mapUnique(error);
    }
  }

  async remove(id: string): Promise<{ id: string }> {
    await this.get(id);
    try {
      await this.prisma.category.delete({
        where: { id },
        select: { id: true },
      });
    } catch (error) {
      // Products will reference categories (ON DELETE RESTRICT).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException({
          code: 'CATEGORY_IN_USE',
          message:
            'This category still has products. Move or delete them first, or hide the category.',
        });
      }
      throw error;
    }
    return { id };
  }

  /**
   * Saves a new order: the listed ids get positions 0, 1, 2… in that order.
   * Every id must belong to the current shop.
   */
  async reorder(ids: string[]): Promise<CategoryView[]> {
    const shopId = await this.shops.currentShopId();
    const found = await this.prisma.category.findMany({
      where: { shopId, id: { in: ids } },
      select: { id: true },
    });
    const known = new Set(found.map((c) => c.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length) {
      throw new BadRequestException({
        code: 'CATEGORY_NOT_FOUND',
        message: `Unknown category ids: ${missing.join(', ')}`,
      });
    }

    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.category.update({
          where: { id },
          data: { sortOrder: index },
          select: { id: true },
        }),
      ),
    );
    return this.list();
  }

  /** Names are unique per shop, ignoring upper/lower case. */
  private async assertNameFree(
    shopId: string,
    name: string,
    exceptId?: string,
  ) {
    const clash = await this.prisma.category.findFirst({
      where: {
        shopId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw nameTaken();
  }
}

/** Exact duplicates that slipped past the check (two requests at once). */
function mapUnique(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return nameTaken();
  }
  return error;
}
