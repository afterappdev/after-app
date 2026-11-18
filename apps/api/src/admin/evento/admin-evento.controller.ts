import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AdminOnly } from '../guards/admin-only.decorator';
import {
  EventoCheckDto,
  EventoFeedQueryDto,
  EventoSectionQueryDto,
} from './admin-evento.dto';
import { AdminEventoService } from './admin-evento.service';

@Controller('admin/evento')
@AdminOnly()
export class AdminEventoController {
  constructor(private readonly evento: AdminEventoService) {}

  @Get('sections')
  sections() {
    return this.evento.listSections();
  }

  @Get('users')
  listUsers(@Query() query: EventoSectionQueryDto) {
    return this.evento.snapshot(query.section);
  }

  @Get('feed')
  feed(@Query() query: EventoFeedQueryDto) {
    return this.evento.feed(query.since, query.section);
  }

  @Patch('users/:userId/checked')
  setChecked(@Param('userId') userId: string, @Body() body: EventoCheckDto) {
    return this.evento.setChecked(userId, body.checked, body.section);
  }
}