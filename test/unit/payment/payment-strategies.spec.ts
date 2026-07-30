import {
  buildBarcode,
  dueDateFactor,
  mod10,
  mod11,
  toDigitableLine,
} from '../../../src/modules/payment/domain/strategies/boleto.strategy';
import { buildBrCode, crc16 } from '../../../src/modules/payment/domain/strategies/pix.strategy';
import {
  isValidCnpj,
  isValidCpf,
} from '../../../src/modules/payment/domain/value-objects/payment-method.vo';
import {
  isValidSignature,
  signPayload,
} from '../../../src/modules/payment/infrastructure/webhook-signature';

describe('PIX BR Code', () => {
  it('uses CRC16/CCITT-FALSE (check value 29B1)', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('builds a self-consistent EMV payload', () => {
    const code = buildBrCode({
      key: 'pix@shop.dev',
      merchantName: 'Nexus Comércio',
      merchantCity: 'São Paulo',
      amount: 123.45,
      txid: 'ABC123',
    });

    expect(code.startsWith('000201010212')).toBe(true);
    expect(code).toContain('0014br.gov.bcb.pix0112pix@shop.dev');
    expect(code).toContain('5406123.45');
    expect(code).toContain('5914NEXUS COMERCIO'); // accents stripped, uppercased
    const body = code.slice(0, -4);
    expect(code.slice(-4)).toBe(crc16(body));
  });
});

describe('Boleto (FEBRABAN)', () => {
  // Reference values from a published bank slip:
  // 00190.50095 40144.816069 06809.350314 3 37370000000100
  it('computes mod-10 field check digits', () => {
    expect(mod10('001905009')).toBe(5);
    expect(mod10('4014481606')).toBe(9);
    expect(mod10('0680935031')).toBe(4);
  });

  it('computes the mod-11 barcode check digit', () => {
    expect(mod11('0019373700000001000500940144816060680935031')).toBe(3);
  });

  it('produces a 44-digit barcode and a matching digitable line', () => {
    const barcode = buildBarcode(
      '999',
      new Date('2026-06-10T12:00:00Z'),
      30_000,
      '1234567890123456789012345',
    );
    expect(barcode).toMatch(/^\d{44}$/);
    const line = toDigitableLine(barcode).replace(/\D/g, '');
    expect(line).toHaveLength(47);
    expect(line.slice(-10)).toBe('0000030000');
  });

  it('handles the 2025 due-date factor rollover', () => {
    expect(dueDateFactor(new Date('2025-02-21T00:00:00Z'))).toBe('9999');
    expect(dueDateFactor(new Date('2025-02-22T00:00:00Z'))).toBe('1000');
  });
});

describe('Brazilian documents', () => {
  it('validates CPF and CNPJ check digits', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('52998224724')).toBe(false);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCnpj('11222333000181')).toBe(true);
    expect(isValidCnpj('11222333000180')).toBe(false);
  });
});

describe('Webhook signatures', () => {
  it('accepts the right HMAC and rejects tampering', () => {
    const body = JSON.stringify({ providerReference: 'pix_1', status: 'APPROVED' });
    const signature = signPayload(body, 'secret');

    expect(isValidSignature(body, signature, 'secret')).toBe(true);
    expect(isValidSignature(body.replace('APPROVED', 'DECLINED'), signature, 'secret')).toBe(false);
    expect(isValidSignature(body, signature, 'other-secret')).toBe(false);
    expect(isValidSignature(body, undefined, 'secret')).toBe(false);
  });
});
