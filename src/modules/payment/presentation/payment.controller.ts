import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Request } from 'express';
import { appConfig } from '../../../config/app.config';
import { AuthenticatedUser, CurrentUser, Public, Role } from '../../../shared/auth';
import { unwrap } from '../../../shared/domain';
import { ConfirmProviderNotificationCommand } from '../application/commands/process-payment.command';
import { PaymentService } from '../application/services/payment.service';
import { PaymentView, toPaymentView } from '../application/views/payment.view';
import { isValidSignature } from '../infrastructure/webhook-signature';
import { ProviderWebhookDto } from './dtos/payment.dtos';

export const SIGNATURE_HEADER = 'x-webhook-signature';

@Controller('payments')
export class PaymentController {
  constructor(
    private readonly payments: PaymentService,
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
  ) {}

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaymentView> {
    const payment = await this.payments.findById(id);
    if (!payment) throw new NotFoundException(`Payment "${id}" was not found`);
    if (user.role !== Role.Admin && payment.customerId !== user.userId) {
      throw new ForbiddenException();
    }
    return toPaymentView(payment);
  }

  /**
   * Settlement notifications from the payment provider. Authenticated by an HMAC
   * signature of the raw body (not JWT), and idempotent so provider retries are safe.
   */
  @Public()
  @Post('webhooks/provider')
  @HttpCode(HttpStatus.OK)
  async providerWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers(SIGNATURE_HEADER) signature: string | undefined,
    @Body() dto: ProviderWebhookDto,
  ): Promise<{ received: true; status: string }> {
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body));
    if (!isValidSignature(rawBody, signature, this.config.payments.webhookSecret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const payment = unwrap(
      await this.payments.confirmProviderNotification(
        new ConfirmProviderNotificationCommand(dto.providerReference, dto.status, dto.reason),
      ),
    );
    return { received: true, status: payment.status };
  }
}
