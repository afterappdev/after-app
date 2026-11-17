import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AdminOnly } from '../guards/admin-only.decorator';
import { EventoCheckDto, EventoFeedQueryDto } from './admin-evento.dto';
import { AdminEventoService } from './admin-evento.service';

@Controller('admin/evento')
@AdminOnly()
export class AdminEventoController {
  constructor(private readonly evento: AdminEventoService) {}

  @Get('users')
  listUsers() {
    return this.evento.snapshot();
  }

  @Get('feed')
  feed(@Query() query: EventoFeedQueryDto) {
    return this.evento.feed(query.since);
  }

  @Patch('users/:userId/checked')
  setChecked(@Param('userId') userId: string, @Body() body: EventoCheckDto) {
    return this.evento.setChecked(userId, body.checked);
  }
}