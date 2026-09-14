import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const UPLOAD_DIR = join(process.cwd(), 'uploads');

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly config: ConfigService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 80 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok =
          file.mimetype.startsWith('image/') ||
          file.mimetype.startsWith('video/');
        if (!ok) {
          cb(
            new BadRequestException(
              'Apenas imagens ou vídeos são permitidos',
            ) as never,
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) {
      throw new BadRequestException('Arquivo obrigatório (campo file)');
    }

    const publicApiUrl = this.config
      .get<string>('PUBLIC_API_URL')
      ?.trim()
      .replace(/\/$/, '');
    const url = publicApiUrl
      ? `${publicApiUrl}/uploads/${file.filename}`
      : `${req.protocol || 'http'}://${req.get('host') ?? 'localhost:3000'}/uploads/${file.filename}`;

    return {
      url,
      path: `/uploads/${file.filename}`,
      filename: file.filename,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
