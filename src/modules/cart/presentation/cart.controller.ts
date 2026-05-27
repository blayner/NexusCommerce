import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../../../shared/auth';
import { unwrap } from '../../../shared/domain';
import { AddToCartCommand, AddToCartHandler } from '../application/commands/add-to-cart.command';
import {
  RemoveFromCartCommand,
  RemoveFromCartHandler,
} from '../application/commands/remove-from-cart.command';
import { CartService } from '../application/services/cart.service';
import { CartView } from '../application/views/cart.view';
import { AddToCartDto, ApplyCouponDto, UpdateCartItemDto } from './dtos/cart.dtos';

@Controller('cart')
export class CartController {
  constructor(
    private readonly carts: CartService,
    private readonly addToCart: AddToCartHandler,
    private readonly removeFromCart: RemoveFromCartHandler,
  ) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<CartView> {
    return this.carts.getCart(user.userId);
  }

  @Post('items')
  async addItem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddToCartDto,
  ): Promise<CartView> {
    unwrap(
      await this.addToCart.execute(new AddToCartCommand(user.userId, dto.productId, dto.quantity)),
    );
    return this.carts.getCart(user.userId);
  }

  @Patch('items/:productId')
  async updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<CartView> {
    return unwrap(await this.carts.updateQuantity(user.userId, productId, dto.quantity));
  }

  @Delete('items/:productId')
  async removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<CartView> {
    unwrap(await this.removeFromCart.execute(new RemoveFromCartCommand(user.userId, productId)));
    return this.carts.getCart(user.userId);
  }

  @Post('coupon')
  @HttpCode(HttpStatus.OK)
  async applyCoupon(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApplyCouponDto,
  ): Promise<CartView> {
    return unwrap(await this.carts.applyCoupon(user.userId, dto.code));
  }

  @Delete('coupon')
  removeCoupon(@CurrentUser() user: AuthenticatedUser): Promise<CartView> {
    return this.carts.removeCoupon(user.userId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  clear(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.carts.clear(user.userId);
  }
}
