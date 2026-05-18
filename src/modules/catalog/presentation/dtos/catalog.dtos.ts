import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SUPPORTED_CURRENCIES, Currency } from '../../../../shared/domain';
import { ProductSort } from '../../domain/repositories/product.repository.port';

export class CreateProductDto {
  @IsString()
  @Length(3, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  description?: string;

  @IsString()
  @Length(2, 64)
  sku!: string;

  @IsInt()
  @Min(1)
  priceInCents!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  compareAtPriceInCents?: number;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: Currency;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  initialStock?: number;
}

export class UpdateStockDto {
  @IsIn(['RESTOCK', 'ADJUST'])
  operation!: 'RESTOCK' | 'ADJUST';

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantity!: number;
}

export class ChangePriceDto {
  @IsInt()
  @Min(1)
  priceInCents!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  compareAtPriceInCents?: number | null;
}

export class CreateCategoryDto {
  @IsString()
  @Length(2, 60)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}

const SORTS: ProductSort[] = ['newest', 'price_asc', 'price_desc', 'name'];

export class SearchProductsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  inStock?: boolean;

  @IsOptional()
  @IsIn(SORTS)
  sort?: ProductSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
