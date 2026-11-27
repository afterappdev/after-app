import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { existsSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import {
  browserMp4Args,
  ffprobeStreamArgs,
  isVideoUpload,
  prepareBrowserVideo,
  streamKinds,
  type ProcessResult,
  type ProcessRunner,
} from './video-transcode';

function ok(stdout = ''): ProcessResult {
  return { code: 0, stdout, stderr: '' };
}

describe('browserMp4Args', () => {
  it('usa H.264 yuv420p, AAC-LC e faststart quando há áudio', () => {
    const args = browserMp4Args('/in.mov', '/out.mp4', true);
    expect(args).toEqual(
      expect.arrayContaining([
        '-c:v',
        'libx264',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-map',
        '0:a:0',
        '-c:a',
        'aac',
        '-profile:a',
        'aac_low',
        '-movflags',
        '+faststart',
        '-f',
        'mp4',
        '/out.mp4',
      ]),
    );
    expect(args).toContain('scale=-2:min(1080\\,ih)');
  });

  it('gera AAC mesmo sem trilha de áudio na origem', () => {
    const args = browserMp4Args('/in.mov', '/out.mp4', false);
    expect(args).toEqual(
      expect.arrayContaining([
        '-i',
        'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-map',
        '1:a:0',
        '-c:a',
        'aac',
        '-shortest',
      ]),
    );
  });
});

describe('streamKinds', () => {
  it('lê os tipos do ffprobe', () => {
    expect(streamKinds('video\naudio\n')).toEqual({ video: true, audio: true });
    expect(streamKinds('video\n')).toEqual({ video: true, audio: false });
  });
});

describe('isVideoUpload', () => {
  it('trata mimetype de vídeo e extensão mesmo com octet-stream', () => {
    expect(isVideoUpload('video/quicktime', 'clip.mov')).toBe(true);
    expect(isVideoUpload('application/octet-stream', 'clip.MOV')).toBe(true);
    expect(isVideoUpload('image/jpeg', 'photo.jpg')).toBe(false);
  });
});

describe('prepareBrowserVideo', () => {
  it('devolve a foto sem chamar ffmpeg', async () => {
    const run = jest.fn<Promise<ProcessResult>, [string, string[]]>();
    const input = {
      buffer: Buffer.from('jpg'),
      mimetype: 'image/jpeg',
      originalname: 'photo.jpg',
    };
    await expect(prepareBrowserVideo(input, run)).resolves.toBe(input);
    expect(run).not.toHaveBeenCalled();
  });

  it('grava MP4 H.264/AAC e apaga o temporário', async () => {
    const seen: string[][] = [];
    const run: ProcessRunner = async (bin, args) => {
      seen.push([bin, ...args]);
      if (bin === 'ffprobe') return ok('video\naudio\n');
      const output = args[args.length - 1];
      writeFileSync(output, Buffer.from('mp4-bytes'));
      return ok();
    };
    const prepared = await prepareBrowserVideo(
      {
        buffer: Buffer.from('mov-bytes'),
        mimetype: 'video/quicktime',
        originalname: 'clip.mov',
      },
      run,
    );
    expect(prepared).toEqual({
      buffer: Buffer.from('mp4-bytes'),
      mimetype: 'video/mp4',
      originalname: 'video.mp4',
    });
    expect(seen[0][0]).toBe('ffprobe');
    expect(seen[0].slice(1)).toEqual(ffprobeStreamArgs(seen[0][seen[0].length - 1]));
    expect(seen[1][0]).toBe('ffmpeg');
    expect(seen[1]).toEqual(
      expect.arrayContaining(['libx264', '0:a:0', 'aac', '+faststart']),
    );
    expect(existsSync(dirname(seen[0][seen[0].length - 1]))).toBe(false);
  });

  it('recusa arquivo sem trilha de vídeo', async () => {
    const run: ProcessRunner = async () => ok('audio\n');
    await expect(
      prepareBrowserVideo(
        {
          buffer: Buffer.from('x'),
          mimetype: 'video/mp4',
          originalname: 'a.mp4',
        },
        run,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('responde indisponível quando o binário não existe', async () => {
    const run: ProcessRunner = async () => ({
      code: null,
      stdout: '',
      stderr: '',
      error: Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }),
    });
    await expect(
      prepareBrowserVideo(
        {
          buffer: Buffer.from('x'),
          mimetype: 'video/mp4',
          originalname: 'a.mp4',
        },
        run,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejeita quando o ffmpeg falha', async () => {
    const run: ProcessRunner = async (bin) =>
      bin === 'ffprobe'
        ? ok('video\n')
        : { code: 1, stdout: '', stderr: 'encoder failed' };
    await expect(
      prepareBrowserVideo(
        {
          buffer: Buffer.from('x'),
          mimetype: 'video/webm',
          originalname: 'a.webm',
        },
        run,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

