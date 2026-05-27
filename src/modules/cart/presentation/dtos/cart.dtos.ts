import { IsInt, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class AddToCartDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class UpdateCartItemDto {
  @IsInt()
  @Min(0)
  @Max(99)
  quantity!: number;
}

export class ApplyCouponDto {
  @IsString()
  @Length(3, 32)
  code!: string;
}
