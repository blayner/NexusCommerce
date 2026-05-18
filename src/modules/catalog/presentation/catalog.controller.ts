import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Paginated } from '../../../shared/application/pagination';
import { Public, Role, Roles } from '../../../shared/auth';
import { unwrap } from '../../../shared/domain';
import {
  CreateCategoryCommand,
  CreateCategoryHandler,
} from '../application/commands/create-category.command';
import {
  ChangePriceCommand,
  ChangePriceHandler,
} from '../application/commands/change-price.command';
import {
  CreateProductCommand,
  CreateProductHandler,
} from '../application/commands/create-product.command';
import {
  UpdateStockCommand,
  UpdateStockHandler,
} from '../application/commands/update-stock.command';
import { GetProductHandler, GetProductQuery } from '../application/queries/get-product.query';
import {
  SearchProductsHandler,
  SearchProductsQuery,
} from '../application/queries/search-products.query';
import {
  CategoryView,
  ProductView,
  toCategoryView,
  toProductView,
} from '../application/views/product.view';
import {
  CATEGORY_REPOSITORY,
  CategoryRepositoryPort,
} from '../domain/repositories/category.repository.port';
import {
  ChangePriceDto,
  CreateCategoryDto,
  CreateProductDto,
  SearchProductsDto,
  UpdateStockDto,
} from './dtos/catalog.dtos';

@Controller()
export class CatalogController {
  constructor(
    private readonly createProduct: CreateProductHandler,
    private readonly updateStock: UpdateStockHandler,
    private readonly changePrice: ChangePriceHandler,
    private readonly createCategory: CreateCategoryHandler,
    private readonly getProduct: GetProductHandler,
    private readonly searchProducts: SearchProductsHandler,
    @Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepositoryPort,
  ) {}

  @Public()
  @Get('products')
  async search(@Query() query: SearchProductsDto): Promise<Paginated<ProductView>> {
    return unwrap(
      await this.searchProducts.execute(
        new SearchProductsQuery({
          text: query.q,
          categoryId: query.categoryId,
          minPriceInCents: query.minPrice,
          maxPriceInCents: query.maxPrice,
          inStockOnly: query.inStock,
          sort: query.sort,
          page: query.page,
          pageSize: query.pageSize,
        }),
      ),
    );
  }

  @Public()
  @Get('products/:id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProductView> {
    return unwrap(await this.getProduct.execute(new GetProductQuery(id)));
  }

  @Roles(Role.Admin)
  @Post('products')
  async create(@Body() dto: CreateProductDto): Promise<ProductView> {
    const product = unwrap(await this.createProduct.execute(new CreateProductCommand(dto)));
    return toProductView(product);
  }

  @Roles(Role.Admin)
  @Patch('products/:id/stock')
  async adjustStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStockDto,
  ): Promise<ProductView> {
    const product = unwrap(
      await this.updateStock.execute(new UpdateStockCommand(id, dto.operation, dto.quantity)),
    );
    return toProductView(product);
  }

  @Roles(Role.Admin)
  @Patch('products/:id/price')
  async updatePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangePriceDto,
  ): Promise<ProductView> {
    const product = unwrap(
      await this.changePrice.execute(
        new ChangePriceCommand(id, dto.priceInCents, dto.compareAtPriceInCents),
      ),
    );
    return toProductView(product);
  }

  @Public()
  @Get('categories')
  async listCategories(): Promise<CategoryView[]> {
    return (await this.categories.findAll()).map(toCategoryView);
  }

  @Roles(Role.Admin)
  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  async addCategory(@Body() dto: CreateCategoryDto): Promise<CategoryView> {
    const category = unwrap(
      await this.createCategory.execute(new CreateCategoryCommand(dto.name, dto.parentId ?? null)),
    );
    return toCategoryView(category);
  }
}
