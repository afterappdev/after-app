import { Body, Controller, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { CreditsService } from './credits.service';

/** Public webhook surface — JWT is not required. Credits only after Mercado Pago API confirmation. */
@Controller('credits/webhooks')
export class CreditsWebhooksController {
  constructor(private readonly creditsService: CreditsService) {}

  @Post('pix')
  @HttpCode(200)
  handlePix(
    @Body() payload: unknown,
    @Headers('x-signature') xSignature?: string,
    @Headers('x-request-id') xRequestId?: string,
    @Query() query?: Record<string, unknown>,
  ) {
    return this.creditsService.handlePixWebhook(payload, {
      xSignature,
      xRequestId,
      query,
    });
  }
}
