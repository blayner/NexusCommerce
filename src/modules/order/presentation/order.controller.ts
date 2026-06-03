import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { mapPage, Paginated } from '../../../shared/application/pagination';
import { AuthenticatedUser, CurrentUser, Role, Roles } from '../../../shared/auth';
import { unwrap } from '../../../shared/domain';
import {
  CancelOrderCommand,
  CancelOrderHandler,
} from '../application/commands/cancel-order.command';
import { PlaceOrderCommand, PlaceOrderHandler } from '../application/commands/place-order.command';
import { OrderService } from '../application/services/order.service';
import { OrderView, PlaceOrderView, toOrderView } from '../application/views/order.view';
import { CancelOrderDto, ListOrdersDto, PlaceOrderDto, ShipOrderDto } from './dtos/order.dtos';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;

@Controller('orders')
export class OrderController {
  constructor(
    private readonly placeOrder: PlaceOrderHandler,
    private readonly cancelOrder: CancelOrderHandler,
    private readonly orders: OrderService,
  ) {}

  /** Checkout: turns the current cart into an order and starts payment. */
  @Post()
  async place(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PlaceOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PlaceOrderView> {
    if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key must have 8-128 URL-safe characters');
    }

    const { order, charge } = unwrap(
      await this.placeOrder.execute(
        new PlaceOrderCommand(
          user.userId,
          user.email,
          dto.paymentMethod.toCheckoutMethod(),
          idempotencyKey,
        ),
      ),
    );

    return {
      ...toOrderView(order),
      payment: charge
        ? {
            status: charge.status,
            instructions: charge.status === 'PENDING' ? charge.instructions : null,
            expiresAt:
              charge.status === 'PENDING' ? (charge.expiresAt?.toISOString() ?? null) : null,
          }
        : null,
    };
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOrdersDto,
  ): Promise<Paginated<OrderView>> {
    const page = await this.orders.listForCustomer(user.userId, query.page, query.pageSize);
    return mapPage(page, toOrderView);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderView> {
    const order = unwrap(
      await this.orders.getForUser(id, { userId: user.userId, isAdmin: user.role === Role.Admin }),
    );
    return toOrderView(order);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ): Promise<OrderView> {
    const order = unwrap(
      await this.cancelOrder.execute(
        new CancelOrderCommand(
          id,
          { userId: user.userId, isAdmin: user.role === Role.Admin },
          dto.reason,
        ),
      ),
    );
    return toOrderView(order);
  }

  @Roles(Role.Admin)
  @Patch(':id/ship')
  async ship(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShipOrderDto,
  ): Promise<OrderView> {
    return toOrderView(unwrap(await this.orders.ship(id, dto.trackingCode)));
  }

  @Roles(Role.Admin)
  @Patch(':id/deliver')
  async deliver(@Param('id', ParseUUIDPipe) id: string): Promise<OrderView> {
    return toOrderView(unwrap(await this.orders.deliver(id)));
  }
}
