import {
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { extname, join } from 'path';
import { objectExtension } from './r2-storage.service';

const log = new Logger('VideoTranscode');

/** Tempo máximo de um ffmpeg. Abaixo do corte típico do proxy. */
export const TRANSCODE_TIMEOUT_MS = 180_000;

const VIDEO_EXT = new Set([
  '.mp4',
  '.mov',
  '.webm',
  '.m4v',
  '.mpeg',
  '.mpg',
  '.3gp',
  '.avi',
  '.mkv',
]);

export type UploadPayload = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

export type ProcessResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
  timedOut?: boolean;
};

export type ProcessRunner = (bin: string, args: string[]) => Promise<ProcessResult>;

export function isVideoUpload(mimetype: string, originalname: string): boolean {
  if (mimetype.toLowerCase().startsWith('video/')) return true;
  return VIDEO_EXT.has(extname(originalname).toLowerCase());
}

export function ffmpegBinary(): string {
  return process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
}

export function ffprobeBinary(): string {
  return process.env.FFPROBE_PATH?.trim() || 'ffprobe';
}

export function ffprobeStreamArgs(inputPath: string): string[] {
  return [
    '-v',
    'error',
    '-show_entries',
    'stream=codec_type',
    '-of',
    'csv=p=0',
    inputPath,
  ];
}

export function streamKinds(ffprobeStdout: string): {
  video: boolean;
  audio: boolean;
} {
  const kinds = new Set(
    ffprobeStdout
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
  return { video: kinds.has('video'), audio: kinds.has('audio') };
}

/**
 * MP4 para navegador: H.264 High/yuv420p e sempre uma faixa AAC-LC.
 * Sem áudio na origem, entra silêncio estéreo. Altura máxima 1080.
 * `+faststart` deixa o moov no início.
 */
export function browserMp4Args(
  inputPath: string,
  outputPath: string,
  hasAudio: boolean,
): string[] {
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    inputPath,
  ];
  if (!hasAudio) {
    args.push(
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100',
    );
  }
  args.push(
    '-map',
    '0:v:0',
    '-map',
    hasAudio ? '0:a:0' : '1:a:0',
    '-c:v',
    'libx264',
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-vf',
    'scale=-2:min(1080\\,ih)',
    '-threads',
    '2',
    '-c:a',
    'aac',
    '-profile:a',
    'aac_low',
    '-b:a',
    '128k',
    '-ac',
    '2',
    '-ar',
    '44100',
  );
  if (!hasAudio) args.push('-shortest');
  args.push('-movflags', '+faststart', '-f', 'mp4', outputPath);
  return args;
}

export function runProcess(
  bin: string,
  args: string[],
  timeoutMs = TRANSCODE_TIMEOUT_MS,
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    const finish = (result: ProcessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error: NodeJS.ErrnoException) => {
      finish({
        code: null,
        stdout: '',
        stderr: '',
        error,
        timedOut: false,
      });
    });
    child.on('close', (code) => {
      finish({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        timedOut,
      });
    });
  });
}

export async function prepareBrowserVideo(
  input: UploadPayload,
  run: ProcessRunner = runProcess,
): Promise<UploadPayload> {
  if (!isVideoUpload(input.mimetype, input.originalname)) {
    return input;
  }

  const ext = objectExtension(input.originalname, input.mimetype);
  const dir = await mkdtemp(join(tmpdir(), 'after-video-'));
  const inputPath = join(dir, `${randomUUID()}${ext}`);
  const outputPath = join(dir, `${randomUUID()}.mp4`);
  try {
    await writeFile(inputPath, input.buffer);
    const probe = await run(ffprobeBinary(), ffprobeStreamArgs(inputPath));
    assertProcess(probe, 'ffprobe');
    const kinds = streamKinds(probe.stdout);
    if (!kinds.video) {
      throw new BadRequestException('O arquivo não contém vídeo');
    }
    const encoded = await run(
      ffmpegBinary(),
      browserMp4Args(inputPath, outputPath, kinds.audio),
    );
    assertProcess(encoded, 'ffmpeg');
    const buffer = await readFile(outputPath);
    if (buffer.length === 0) {
      throw new BadRequestException('Não foi possível converter o vídeo');
    }
    return {
      buffer,
      mimetype: 'video/mp4',
      originalname: 'video.mp4',
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function assertProcess(result: ProcessResult, bin: string): void {
  if (result.error?.code === 'ENOENT') {
    throw new ServiceUnavailableException('Conversão de vídeo indisponível');
  }
  if (result.timedOut) {
    throw new ServiceUnavailableException(
      'A conversão do vídeo excedeu o tempo limite',
    );
  }
  if (result.code !== 0) {
    const detail = result.stderr.trim().slice(0, 500);
    if (detail) log.warn(`${bin} falhou: ${detail}`);
    throw new BadRequestException('Não foi possível converter o vídeo');
  }
}
