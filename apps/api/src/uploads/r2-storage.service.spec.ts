import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import {
  objectExtension,
  R2StorageService,
} from './r2-storage.service';

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn(),
  };
});

const send = jest.fn();

function config(map: Record<string, string>): ConfigService {
  return {
    get: (key: string) => map[key],
  } as unknown as ConfigService;
}

const ENV = {
  R2_ACCOUNT_ID: 'acct-test',
  R2_ACCESS_KEY_ID: 'key-test',
  R2_SECRET_ACCESS_KEY: 'secret-test',
  R2_BUCKET: 'after-uploads',
  R2_PUBLIC_URL: 'https://media.app-after.com.br/',
};

const OBJECT_KEY = /^uploads\/[0-9a-f-]{36}\.jpg$/;

describe('R2StorageService', () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({});
    (S3Client as unknown as jest.Mock).mockImplementation(() => ({ send }));
  });

  it('envia o objeto ao R2 com ContentType e devolve URL/path/key', async () => {
    const service = new R2StorageService(config(ENV));
    const buffer = Buffer.from('jpeg-bytes');

    const stored = await service.upload({
      buffer,
      mimetype: 'image/jpeg',
      originalname: 'Foto da Capa.JPG',
    });

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input.Bucket).toBe('after-uploads');
    expect(command.input.Key).toMatch(OBJECT_KEY);
    expect(command.input.Body).toBe(buffer);
    expect(command.input.ContentType).toBe('image/jpeg');
    expect(stored.key).toBe(command.input.Key);
    expect(stored.filename).toBe(stored.key.replace(/^uploads\//, ''));
    expect(stored.path).toBe(`/${stored.key}`);
    expect(stored.url).toBe(
      `https://media.app-after.com.br/${stored.key}`,
    );
    expect(stored.filename).not.toContain('Foto da Capa');
  });

  it('não usa o nome original como nome final do objeto', async () => {
    const service = new R2StorageService(config(ENV));

    const stored = await service.upload({
      buffer: Buffer.from('x'),
      mimetype: 'image/png',
      originalname: '../../../etc/passwd.png',
    });

    expect(stored.filename).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(stored.key).toBe(`uploads/${stored.filename}`);
    expect(stored.filename).not.toContain('passwd');
    expect(stored.key).not.toContain('..');
  });

  it('configura o client S3 para o endpoint R2 e não chama a rede real', async () => {
    const service = new R2StorageService(config(ENV));
    await service.upload({
      buffer: Buffer.from('x'),
      mimetype: 'video/mp4',
      originalname: 'clip.mp4',
    });
    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'auto',
        endpoint: 'https://acct-test.r2.cloudflarestorage.com',
      }),
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('objectExtension', () => {
  it('preserva extensão válida do arquivo original', () => {
    expect(objectExtension('a.WEBP', 'image/webp')).toBe('.webp');
  });

  it('ignora extensão perigosa e cai no mimetype', () => {
    expect(objectExtension('a.exe', 'image/png')).toBe('.png');
  });
});
