import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
export const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

@Injectable()
export class VideoTranscodeService {
  private active = false;

  async toMp4(buffer: Buffer): Promise<Buffer> {
    if (this.active) {
      throw new ServiceUnavailableException(
        'Há um vídeo em processamento. Tente enviar novamente em instantes.',
      );
    }

    this.active = true;
    let directory: string | undefined;
    try {
      directory = await mkdtemp(join(tmpdir(), 'after-video-'));
      const source = join(directory, 'source');
      const output = join(directory, 'video.mp4');
      await writeFile(source, buffer);

      try {
        await run(
          'ffmpeg',
          [
            '-nostdin',
            '-loglevel',
            'error',
            '-xerror',
            '-protocol_whitelist',
            'file',
            '-format_whitelist',
            'mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,avi,mpeg,mpegvideo,mpegts,ogg',
            '-threads',
            '2',
            '-i',
            source,
            '-map',
            '0:V:0',
            '-map',
            '0:a:0?',
            '-map_metadata',
            '-1',
            '-map_chapters',
            '-1',
            '-filter_threads',
            '2',
            '-vf',
            "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
            '-c:v',
            'libx264',
            '-threads',
            '2',
            '-preset',
            'veryfast',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-ac',
            '2',
            '-movflags',
            '+faststart',
            '-fs',
            String(MAX_UPLOAD_BYTES + 1),
            output,
          ],
          {
            timeout: 60_000,
            killSignal: 'SIGKILL',
            maxBuffer: 64 * 1024,
            windowsHide: true,
          },
        );
      } catch (error) {
        const failure = error as NodeJS.ErrnoException & { killed?: boolean };
        if (failure.code === 'ENOENT') {
          throw new ServiceUnavailableException(
            'Conversão de vídeo indisponível.',
          );
        }
        throw new UnprocessableEntityException(
          failure.killed
            ? 'O vídeo demorou demais para ser convertido. Envie um vídeo mais curto.'
            : 'Não foi possível converter o vídeo. Verifique se o arquivo está íntegro.',
        );
      }

      if ((await stat(output)).size >= MAX_UPLOAD_BYTES) {
        throw new UnprocessableEntityException(
          'O vídeo convertido excede 80 MB.',
        );
      }
      return await readFile(output);
    } finally {
      try {
        if (directory) await rm(directory, { recursive: true, force: true });
      } finally {
        this.active = false;
      }
    }
  }
}
