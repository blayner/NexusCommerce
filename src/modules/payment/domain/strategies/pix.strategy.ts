import { Payment } from '../entities/payment.entity';
import { PaymentStrategy, StrategyOutcome } from './payment-strategy.interface';

export interface PixSettings {
  key: string;
  merchantName: string;
  merchantCity: string;
  expirationMinutes?: number;
}

/**
 * Generates a dynamic PIX charge following the BR Code (EMV® QRCPS-MPM) layout defined
 * by the Central Bank of Brazil, including the CRC16/CCITT-FALSE checksum. The payment
 * stays PENDING until the PSP notifies settlement via webhook.
 */
export class PixStrategy implements PaymentStrategy {
  readonly method = 'PIX' as const;

  constructor(private readonly settings: PixSettings) {}

  async execute(payment: Payment): Promise<StrategyOutcome> {
    if (payment.amount.currency !== 'BRL') {
      return { status: 'DECLINED', reason: 'PIX only supports BRL' };
    }

    const txid = payment.id.replace(/-/g, '').slice(0, 25);
    const expiresAt = new Date(Date.now() + (this.settings.expirationMinutes ?? 30) * 60_000);
    const copyAndPaste = buildBrCode({
      key: this.settings.key,
      merchantName: this.settings.merchantName,
      merchantCity: this.settings.merchantCity,
      amount: payment.amount.toDecimal(),
      txid,
    });

    return {
      status: 'PENDING',
      providerReference: `pix_${txid}`,
      instructions: { type: 'PIX', copyAndPaste, txid },
      expiresAt,
    };
  }

  async refund(_payment: Payment): Promise<void> {
    // A real PSP would issue a "devolução" (PIX refund) here.
  }
}

interface BrCodeInput {
  key: string;
  merchantName: string;
  merchantCity: string;
  amount: number;
  txid: string;
}

export function buildBrCode(input: BrCodeInput): string {
  const merchantAccount = emv('00', 'br.gov.bcb.pix') + emv('01', input.key);
  const payload =
    emv('00', '01') + // payload format indicator
    emv('01', '12') + // point of initiation: 12 = single-use (dynamic)
    emv('26', merchantAccount) +
    emv('52', '0000') + // merchant category code
    emv('53', '986') + // currency: BRL (ISO 4217)
    emv('54', input.amount.toFixed(2)) +
    emv('58', 'BR') +
    emv('59', ascii(input.merchantName).slice(0, 25)) +
    emv('60', ascii(input.merchantCity).slice(0, 15)) +
    emv('62', emv('05', input.txid)) +
    '6304';

  return payload + crc16(payload);
}

function emv(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, '0')}${value}`;
}

function ascii(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase();
}

/** CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as required by the BR Code spec. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
