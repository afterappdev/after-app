import { isResendConfigured, sendResendEmail } from '../common/resend/resend-email';
import { sanitizeMailerError } from '../users/resend-account-deletion.mailer';
import { appStoreConnectReviewAdminUrl } from './app-store-review.config';
import type { AscCustomerReview } from './app-store-connect-reviews.client';

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** Strip control bytes; keep text e-mail safe (no HTML). */
export function escapeReviewerPlainText(
  value: string | null | undefined,
  maxLen = 4000,
): string {
  if (!value) return '';
  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(CONTROL_CHARS, '')
    .trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen)}…`;
}

export function formatStars(rating: number): string {
  const n = Math.min(5, Math.max(0, Math.trunc(rating)));
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)} (${n}/5)`;
}

export function buildAppStoreReviewEmail(input: {
  review: AscCustomerReview;
  appAppleId: string;
  testMarker?: boolean;
}): { subject: string; text: string } {
  const title = escapeReviewerPlainText(input.review.title, 200) || '(sem título)';
  const body = escapeReviewerPlainText(input.review.body);
  const author =
    escapeReviewerPlainText(input.review.reviewerNickname, 120) || '(anonimizado)';
  const territory = escapeReviewerPlainText(input.review.territory, 16);
  const when = input.review.createdAt.toISOString();
  const link = appStoreConnectReviewAdminUrl(input.appAppleId, input.review.id);
  const prefix = input.testMarker ? '[TESTE After API] ' : '';

  const subject = `${prefix}After App Store — ${formatStars(input.review.rating)} — ${title.slice(0, 80)}`;

  const text = [
    prefix ? 'Este é um e-mail de teste do monitor de avaliações (After API).' : 'Nova avaliação na App Store:',
    '',
    `Estrelas: ${formatStars(input.review.rating)}`,
    `Título: ${title}`,
    `Comentário:`,
    body || '(vazio)',
    '',
    `Autor (nickname): ${author}`,
    territory ? `Território: ${territory}` : null,
    `Data (UTC): ${when}`,
    `ID avaliação: ${input.review.id}`,
    `Abrir no App Store Connect: ${link}`,
    '',
    '— After API',
  ]
    .filter((line) => line !== null)
    .join('\n');

  return { subject, text };
}

export type ReviewMailSendResult =
  | { ok: true }
  | { ok: false; code: 'RESEND_CONFIG'; message: string }
  | { ok: false; code: 'SEND_FAILED'; message: string };

export async function sendAppStoreReviewNotificationEmail(input: {
  to: string;
  review: AscCustomerReview;
  appAppleId: string;
  testMarker?: boolean;
}): Promise<ReviewMailSendResult> {
  if (!isResendConfigured()) {
    return {
      ok: false,
      code: 'RESEND_CONFIG',
      message:
        'RESEND_API_KEY ausente — configure Resend (e opcionalmente RESEND_FROM) para enviar alertas de avaliações.',
    };
  }

  const { subject, text } = buildAppStoreReviewEmail({
    review: input.review,
    appAppleId: input.appAppleId,
    testMarker: input.testMarker,
  });

  try {
    await sendResendEmail({
      to: input.to,
      subject,
      text,
      userAgent: 'after-api/app-store-reviews',
    });
    return { ok: true };
  } catch (err) {
    const sanitized = sanitizeMailerError(err);
    return {
      ok: false,
      code: 'SEND_FAILED',
      message: sanitized.message || 'Falha ao enviar e-mail',
    };
  }
}

export async function sendAppStoreReviewTestEmail(
  to: string,
  appAppleId: string,
): Promise<ReviewMailSendResult> {
  const sample: AscCustomerReview = {
    id: 'test-review-after-api',
    rating: 5,
    title: 'E-mail de teste — monitor ASC',
    body: 'Mensagem gerada pelo script de validação. Não é avaliação real.',
    reviewerNickname: 'After API Test',
    territory: 'BRA',
    createdAt: new Date(),
  };
  return sendAppStoreReviewNotificationEmail({
    to,
    review: sample,
    appAppleId,
    testMarker: true,
  });
}