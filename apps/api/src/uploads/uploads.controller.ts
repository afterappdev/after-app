import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { R2StorageService } from './r2-storage.service';

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly storage: R2StorageService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
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
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Arquivo obrigatório (campo file)');
    }

    const stored = await this.storage.upload({
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
    });

    return {
      url: stored.url,
      path: stored.path,
      filename: stored.filename,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
