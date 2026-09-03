import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from '../../auth/auth.service';
import { LoginDto } from '../../auth/dto/login.dto';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.loginAdmin(dto);
  }
}
