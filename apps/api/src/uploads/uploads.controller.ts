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
import { extname } from 'node:path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { R2StorageService } from './r2-storage.service';
import {
  MAX_UPLOAD_BYTES,
  VideoTranscodeService,
} from './video-transcode.service';

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.m4v',
  '.webm',
  '.avi',
  '.mkv',
  '.3gp',
  '.mpeg',
  '.mpg',
  '.ogv',
]);

function isVideo(
  file: Pick<Express.Multer.File, 'mimetype' | 'originalname'>,
): boolean {
  return (
    file.mimetype.startsWith('video/') ||
    (file.mimetype === 'application/octet-stream' &&
      VIDEO_EXTENSIONS.has(extname(file.originalname).toLowerCase()))
  );
}

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(
    private readonly storage: R2StorageService,
    private readonly videos: VideoTranscodeService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_req, file, cb) => {
        const ok = file.mimetype.startsWith('image/') || isVideo(file);
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

    const video = isVideo(file);
    const buffer = video ? await this.videos.toMp4(file.buffer) : file.buffer;
    const mimetype = video ? 'video/mp4' : file.mimetype;
    const stored = await this.storage.upload({
      buffer,
      mimetype,
      originalname: video ? 'video.mp4' : file.originalname,
    });

    return {
      url: stored.url,
      path: stored.path,
      filename: stored.filename,
      mimeType: mimetype,
      size: video ? buffer.length : file.size,
    };
  }
}
