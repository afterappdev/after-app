import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { AppleLoginDto } from './dto/apple-login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('providers')
  providers() {
    return this.authService.providers();
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('google')
  loginGoogle(@Body() dto: GoogleLoginDto) {
    return this.authService.loginWithGoogle(dto);
  }

  @Post('apple')
  loginApple(@Body() dto: AppleLoginDto) {
    return this.authService.loginWithApple(dto);
  }

  @Get('google/start')
  googleStart(
    @Res() res: Response,
    @Query('redirect') redirect: string,
  ) {
    return res.redirect(this.authService.googleStartUrl(redirect));
  }

  @Get('google/callback')
  async googleCallback(
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    if (error) {
      return res.redirect(this.authService.oauthCancelRedirect(state));
    }
    const target = await this.authService.googleCallback(code, state);
    return res.redirect(target);
  }

  @Get('apple/start')
  appleStart(
    @Res() res: Response,
    @Query('redirect') redirect: string,
  ) {
    return res.redirect(this.authService.appleStartUrl(redirect));
  }

  @Post('apple/callback')
  @UsePipes(
    new ValidationPipe({ whitelist: false, forbidNonWhitelisted: false }),
  )
  async appleCallback(
    @Body()
    body: {
      id_token?: string;
      state?: string;
      user?: string;
    },
    @Res() res: Response,
  ) {
    const target = await this.authService.appleCallback(body);
    return res.redirect(target);
  }
}
