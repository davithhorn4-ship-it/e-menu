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
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  ListCategoriesQueryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
} from './dto/category.dto';

@ApiTags('menu categories')
@ApiBearerAuth('bearer')
@ApiCookieAuth('accessToken')
@ApiForbiddenResponse({ description: 'INSUFFICIENT_PERMISSION' })
@ApiConflictResponse({
  description:
    'SHOP_NOT_SET_UP (run npm run db:seed), CATEGORY_NAME_TAKEN, CATEGORY_IN_USE',
})
@Controller('menu/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions('category.view')
  @ApiOperation({
    summary: 'List menu categories',
    description:
      'All categories of the shop, in menu order (sortOrder, then name).',
  })
  @ApiOkResponse({ description: 'Categories in menu order' })
  async list(@Query() query: ListCategoriesQueryDto) {
    return { success: true, data: await this.categories.list(query) };
  }

  @Put('order')
  @RequirePermissions('category.edit')
  @ApiOperation({
    summary: 'Reorder categories',
    description:
      'Send the ids in their new order (e.g. after drag and drop). Returns the full list.',
  })
  @ApiBadRequestResponse({ description: 'CATEGORY_NOT_FOUND (unknown ids)' })
  async reorder(@Body() dto: ReorderCategoriesDto) {
    return { success: true, data: await this.categories.reorder(dto.ids) };
  }

  @Get(':id')
  @RequirePermissions('category.view')
  @ApiOperation({ summary: 'Get one category' })
  @ApiNotFoundResponse({ description: 'CATEGORY_NOT_FOUND' })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.categories.get(id) };
  }

  @Post()
  @RequirePermissions('category.create')
  @ApiOperation({ summary: 'Create a category' })
  @ApiCreatedResponse({ description: 'Category created' })
  async create(@Body() dto: CreateCategoryDto) {
    return { success: true, data: await this.categories.create(dto) };
  }

  @Patch(':id')
  @RequirePermissions('category.edit')
  @ApiOperation({ summary: 'Update a category (send only what changes)' })
  @ApiNotFoundResponse({ description: 'CATEGORY_NOT_FOUND' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return { success: true, data: await this.categories.update(id, dto) };
  }

  @Delete(':id')
  @RequirePermissions('category.delete')
  @ApiOperation({
    summary: 'Delete a category',
    description:
      'To keep it but hide it from guests, set isActive to false instead.',
  })
  @ApiNotFoundResponse({ description: 'CATEGORY_NOT_FOUND' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.categories.remove(id) };
  }
}
