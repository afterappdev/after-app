import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AccountDeletionService } from './account-deletion.service';
import { DeleteConfirmDto, DeleteRequestDto } from './account-deletion.dto';

@Controller('users')
export class AccountDeletionController {
  constructor(private readonly accountDeletion: AccountDeletionService) {}

  @Post('delete-request')
  @HttpCode(200)
  request(@Body() dto: DeleteRequestDto) {
    return this.accountDeletion.requestDeletion(dto.email);
  }

  @Post('delete-confirm')
  @HttpCode(200)
  confirm(@Body() dto: DeleteConfirmDto) {
    return this.accountDeletion.confirmDeletion(dto.token);
  }
}
