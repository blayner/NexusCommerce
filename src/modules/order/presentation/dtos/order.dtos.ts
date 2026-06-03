import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CheckoutPaymentMethod } from '../../domain/ports/payment-gateway.port';

export class PaymentMethodDto {
  @IsIn(['CREDIT_CARD', 'PIX', 'BOLETO'])
  type!: CheckoutPaymentMethod['type'];

  @ValidateIf((dto: PaymentMethodDto) => dto.type === 'CREDIT_CARD')
  @IsString()
  @Matches(/^tok_[A-Za-z0-9_]{4,64}$/, { message: 'cardToken must be a gateway token (tok_...)' })
  cardToken?: string;

  @ValidateIf((dto: PaymentMethodDto) => dto.type === 'CREDIT_CARD')
  @IsInt()
  @Min(1)
  @Max(12)
  installments?: number;

  @ValidateIf((dto: PaymentMethodDto) => dto.type === 'BOLETO')
  @IsString()
  @Length(11, 18)
  customerDocument?: string;

  @ValidateIf((dto: PaymentMethodDto) => dto.type === 'BOLETO')
  @IsString()
  @Length(3, 120)
  customerName?: string;

  toCheckoutMethod(): CheckoutPaymentMethod {
    switch (this.type) {
      case 'CREDIT_CARD':
        return {
          type: 'CREDIT_CARD',
          cardToken: this.cardToken!,
          installments: this.installments ?? 1,
        };
      case 'PIX':
        return { type: 'PIX' };
      case 'BOLETO':
        return {
          type: 'BOLETO',
          customerDocument: this.customerDocument!,
          customerName: this.customerName!,
        };
    }
  }
}

export class PlaceOrderDto {
  @ValidateNested()
  @Type(() => PaymentMethodDto)
  paymentMethod!: PaymentMethodDto;
}

export class CancelOrderDto {
  @IsString()
  @Length(3, 255)
  reason!: string;
}

export class ShipOrderDto {
  @IsString()
  @Matches(/^[A-Za-z]{2}\d{9}[A-Za-z]{2}$/, {
    message: 'trackingCode must look like BR123456789BR',
  })
  trackingCode!: string;
}

export class ListOrdersDto {
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
