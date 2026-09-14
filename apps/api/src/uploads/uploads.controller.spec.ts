import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { UploadsController } from './uploads.controller';
import { R2StorageService } from './r2-storage.service';

function uploadedFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    buffer: Buffer.from('image-bytes'),
    originalname: 'photo.jpg',
    mimetype: 'image/jpeg',
    size: 128,
    ...overrides,
  } as Express.Multer.File;
}

function storage(
  overrides: Partial<Awaited<ReturnType<R2StorageService['upload']>>> = {},
): jest.Mocked<Pick<R2StorageService, 'upload'>> {
  return {
    upload: jest.fn().mockResolvedValue({
      key: 'uploads/abc.jpg',
      filename: 'abc.jpg',
      path: '/uploads/abc.jpg',
      url: 'https://media.app-after.com.br/uploads/abc.jpg',
      ...overrides,
    }),
  };
}

describe('UploadsController R2', () => {
  it('faz upload e devolve URL pública do R2 no formato atual', async () => {
    const r2 = storage();
    const controller = new UploadsController(r2 as unknown as R2StorageService);
    const file = uploadedFile();

    const result = await controller.upload(file);

    expect(r2.upload).toHaveBeenCalledTimes(1);
    expect(r2.upload).toHaveBeenCalledWith({
      buffer: file.buffer,
      mimetype: 'image/jpeg',
      originalname: 'photo.jpg',
    });
    expect(result).toEqual({
      url: 'https://media.app-after.com.br/uploads/abc.jpg',
      path: '/uploads/abc.jpg',
      filename: 'abc.jpg',
      mimeType: 'image/jpeg',
      size: 128,
    });
  });

  it('rejeita upload sem arquivo', async () => {
    const r2 = storage();
    const controller = new UploadsController(r2 as unknown as R2StorageService);
    await expect(controller.upload(undefined as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(r2.upload).not.toHaveBeenCalled();
  });

  it('não usa diskStorage', () => {
    const src = readFileSync(join(__dirname, 'uploads.controller.ts'), 'utf8');
    expect(src).not.toContain('diskStorage');
    expect(src).toContain('memoryStorage');
  });
});
