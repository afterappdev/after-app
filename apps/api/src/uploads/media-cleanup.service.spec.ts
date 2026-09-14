import { ConfigService } from '@nestjs/config';
import { deleteLocalUploads } from '../common/utils/local-uploads';
import { MediaCleanupService } from './media-cleanup.service';
import { R2StorageService } from './r2-storage.service';

jest.mock('../common/utils/local-uploads', () => {
  const actual = jest.requireActual('../common/utils/local-uploads');
  return {
    ...actual,
    deleteLocalUploads: jest.fn(),
  };
});

const deleteLocalUploadsMock = deleteLocalUploads as jest.MockedFunction<
  typeof deleteLocalUploads
>;

function config(map: Record<string, string>): ConfigService {
  return {
    get: (key: string) => map[key],
  } as unknown as ConfigService;
}

describe('MediaCleanupService', () => {
  let r2: { deleteByUrl: jest.Mock };
  let service: MediaCleanupService;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    deleteLocalUploadsMock.mockReset();
    deleteLocalUploadsMock.mockResolvedValue(undefined);
    r2 = { deleteByUrl: jest.fn().mockResolvedValue(false) };
    service = new MediaCleanupService(
      config({ PUBLIC_API_URL: 'https://api.app-after.com.br' }),
      r2 as unknown as R2StorageService,
    );
    warn = jest.spyOn(service['logger'], 'warn').mockImplementation();
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('URL R2 chama delete do R2 e não o helper local', async () => {
    r2.deleteByUrl.mockResolvedValue(true);
    await service.deleteStoredUpload(
      'https://media.app-after.com.br/uploads/abc.jpg',
    );
    expect(r2.deleteByUrl).toHaveBeenCalledTimes(1);
    expect(deleteLocalUploadsMock).not.toHaveBeenCalled();
  });

  it('upload local legado usa unlink/helper local', async () => {
    await service.deleteStoredUpload(
      'https://api.app-after.com.br/uploads/old.jpg',
    );
    expect(r2.deleteByUrl).toHaveBeenCalledWith(
      'https://api.app-after.com.br/uploads/old.jpg',
    );
    expect(deleteLocalUploadsMock).toHaveBeenCalledWith(
      ['https://api.app-after.com.br/uploads/old.jpg'],
      'https://api.app-after.com.br',
    );
  });

  it('URL externa é no-op', async () => {
    await service.deleteStoredUpload(
      'https://lh3.googleusercontent.com/a/photo',
    );
    expect(r2.deleteByUrl).toHaveBeenCalled();
    expect(deleteLocalUploadsMock).not.toHaveBeenCalled();
  });

  it('deduplica URLs', async () => {
    r2.deleteByUrl.mockResolvedValue(true);
    const url = 'https://media.app-after.com.br/uploads/abc.jpg';
    await service.deleteStoredUploads([url, ` ${url} `, url]);
    expect(r2.deleteByUrl).toHaveBeenCalledTimes(1);
  });

  it('erro R2 não explode o fluxo', async () => {
    r2.deleteByUrl.mockRejectedValue(new Error('R2 down'));
    await expect(
      service.deleteStoredUpload(
        'https://media.app-after.com.br/uploads/abc.jpg',
      ),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('erro local não explode o fluxo', async () => {
    deleteLocalUploadsMock.mockRejectedValue(new Error('EACCES'));
    await expect(
      service.deleteStoredUpload('http://localhost:3000/uploads/a.jpg'),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
