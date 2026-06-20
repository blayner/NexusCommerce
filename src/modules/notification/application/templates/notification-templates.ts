import { TemplateData } from '../../domain/entities/notification.entity';

export interface NotificationTemplate {
  subject: string;
  body: string;
}

export const NOTIFICATION_TEMPLATES = {
  'order-placed': {
    subject: 'Recebemos seu pedido #{{orderNumber}}',
    body: 'Olá! Seu pedido #{{orderNumber}} com {{itemCount}} item(ns) no valor de {{total}} foi recebido e aguarda pagamento.',
  },
  'order-paid': {
    subject: 'Pagamento confirmado – pedido #{{orderNumber}}',
    body: 'Boa notícia: o pagamento de {{total}} do pedido #{{orderNumber}} foi confirmado. Já estamos separando seus produtos.',
  },
  'order-shipped': {
    subject: 'Seu pedido #{{orderNumber}} está a caminho',
    body: 'Seu pedido foi enviado. Acompanhe pelo código de rastreio {{trackingCode}}.',
  },
  'order-cancelled': {
    subject: 'Pedido #{{orderNumber}} cancelado',
    body: 'Seu pedido #{{orderNumber}} foi cancelado. Motivo: {{reason}}.',
  },
} satisfies Record<string, NotificationTemplate>;

export type TemplateKey = keyof typeof NOTIFICATION_TEMPLATES;

export function isTemplateKey(value: string): value is TemplateKey {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_TEMPLATES, value);
}

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

/** Strict renderer: a missing variable is a bug, so it throws instead of printing "undefined". */
export function renderTemplate(key: TemplateKey, data: TemplateData): NotificationTemplate {
  const template = NOTIFICATION_TEMPLATES[key];
  const replace = (text: string) =>
    text.replace(PLACEHOLDER, (_match, name: string) => {
      const value = data[name];
      if (value === undefined) {
        throw new Error(`Template "${key}" is missing variable "${name}"`);
      }
      return String(value);
    });
  return { subject: replace(template.subject), body: replace(template.body) };
}

export function requiredVariables(key: TemplateKey): string[] {
  const { subject, body } = NOTIFICATION_TEMPLATES[key];
  return [...new Set([...`${subject} ${body}`.matchAll(PLACEHOLDER)].map((match) => match[1]))];
}
