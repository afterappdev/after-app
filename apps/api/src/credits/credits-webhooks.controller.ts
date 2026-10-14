import { Body, Controller, Headers, HttpCode, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CreditsService } from './credits.service';
import { extractMercadoPagoSignatureDataId } from './providers/mercado-pago-orders';
import { observeMercadoPagoRawHeaders } from './providers/mercado-pago-webhook-diagnose';

/** Public webhook surface — JWT is not required. Credits only after Mercado Pago API confirmation. */
@Controller('credits/webhooks')
export class CreditsWebhooksController {
  constructor(private readonly creditsService: CreditsService) {}

  @Post('pix')
  @HttpCode(200)
  handlePix(
    @Req() req: Request,
    @Body() payload: unknown,
    @Headers('x-signature') xSignature?: string,
    @Headers('x-request-id') xRequestId?: string,
    @Query() query?: Record<string, unknown>,
  ) {
    return this.handleMercadoPago(req, payload, xSignature, xRequestId, query);
  }

  /** Alias of the PIX route. Mercado Pago has one Orders webhook URL per application. */
  @Post('mercadopago')
  @HttpCode(200)
  handleMercadoPago(
    @Req() req: Request,
    @Body() payload: unknown,
    @Headers('x-signature') xSignature?: string,
    @Headers('x-request-id') xRequestId?: string,
    @Query() query?: Record<string, unknown>,
  ) {
    return this.creditsService.handlePixWebhook(payload, {
      xSignature,
      xRequestId,
      query,
      headerObservation: observeMercadoPagoRawHeaders({
        rawHeaders: req.rawHeaders,
        xSignature,
        xRequestId,
        rawUrl: req.originalUrl || req.url,
        parsedDataId: extractMercadoPagoSignatureDataId(query),
      }),
    });
  }
}
