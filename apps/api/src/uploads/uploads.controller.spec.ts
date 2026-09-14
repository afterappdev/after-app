import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { UploadsController } from './uploads.controller';

function config(map: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => map[key],
  } as unknown as ConfigService;
}

function request(overrides: Partial<Request> = {}): Request {
  return {
    protocol: 'http',
    get: (name: string) => (name.toLowerCase() === 'host' ? 'localhost:3000' : undefined),
    ...overrides,
  } as Request;
}

function uploadedFile(filename = 'photo.jpg'): Express.Multer.File {
  return {
    filename,
    mimetype: 'image/jpeg',
    size: 128,
  } as Express.Multer.File;
}

describe('UploadsController PUBLIC_API_URL', () => {
  it('usa PUBLIC_API_URL sem barra final', () => {
    const controller = new UploadsController(
      config({ PUBLIC_API_URL: 'https://api.app-after.com.br/' }),
    );
    const result = controller.upload(uploadedFile('abc.jpg'), request());
    expect(result.url).toBe('https://api.app-after.com.br/uploads/abc.jpg');
    expect(result.path).toBe('/uploads/abc.jpg');
    expect(result.filename).toBe('abc.jpg');
  });

  it('usa PUBLIC_API_URL de desenvolvimento local', () => {
    const controller = new UploadsController(
      config({ PUBLIC_API_URL: 'http://localhost:3000' }),
    );
    const result = controller.upload(uploadedFile('local.png'), request());
    expect(result.url).toBe('http://localhost:3000/uploads/local.png');
    expect(result.path).toBe('/uploads/local.png');
  });

  it('cai no fallback protocol/host quando PUBLIC_API_URL está ausente', () => {
    const controller = new UploadsController(config({}));
    const req = request({
      protocol: 'https',
      get: (name: string) =>
        name.toLowerCase() === 'host' ? 'proxy.example:443' : undefined,
    });
    const result = controller.upload(uploadedFile('fb.webp'), req);
    expect(result.url).toBe('https://proxy.example:443/uploads/fb.webp');
    expect(result.path).toBe('/uploads/fb.webp');
  });

  it('rejeita upload sem arquivo', () => {
    const controller = new UploadsController(
      config({ PUBLIC_API_URL: 'https://api.app-after.com.br' }),
    );
    expect(() =>
      controller.upload(undefined as never, request()),
    ).toThrow(BadRequestException);
  });
});
