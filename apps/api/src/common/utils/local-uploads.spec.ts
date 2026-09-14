import { unlink } from 'fs/promises';
import {
  isLegacyLocalUpload,
  localUploadFilename,
  deleteLocalUploads,
} from './local-uploads';

jest.mock('fs/promises', () => ({
  unlink: jest.fn(),
}));

const unlinkMock = unlink as jest.MockedFunction<typeof unlink>;

describe('local-uploads legado', () => {
  const publicApi = 'https://api.app-after.com.br';

  beforeEach(() => {
    unlinkMock.mockReset();
    unlinkMock.mockResolvedValue(undefined);
  });

  it('trata PUBLIC_API_URL/uploads/x como local', () => {
    expect(
      localUploadFilename(`${publicApi}/uploads/abc.jpg`, publicApi),
    ).toBe('abc.jpg');
    expect(
      isLegacyLocalUpload(`${publicApi}/uploads/abc.jpg`, publicApi),
    ).toBe(true);
  });

  it('trata localhost como local', () => {
    expect(
      localUploadFilename('http://localhost:3000/uploads/local.png'),
    ).toBe('local.png');
    expect(
      localUploadFilename('http://127.0.0.1:3000/uploads/local.png'),
    ).toBe('local.png');
    expect(
      localUploadFilename('http://10.0.2.2:3000/uploads/local.png'),
    ).toBe('local.png');
    expect(localUploadFilename('/uploads/relative.jpg')).toBe('relative.jpg');
  });

  it('não trata media.app-after.com.br como local', () => {
    expect(
      localUploadFilename(
        'https://media.app-after.com.br/uploads/abc.jpg',
        publicApi,
      ),
    ).toBeNull();
    expect(
      isLegacyLocalUpload(
        'https://media.app-after.com.br/uploads/abc.jpg',
        publicApi,
      ),
    ).toBe(false);
  });

  it('ignora Google/Unsplash', () => {
    expect(
      localUploadFilename('https://lh3.googleusercontent.com/a/photo'),
    ).toBeNull();
    expect(
      localUploadFilename('https://images.unsplash.com/photo-1553621042.jpg'),
    ).toBeNull();
  });

  it('rejeita traversal', () => {
    expect(localUploadFilename('/uploads/../secret.jpg')).toBeNull();
    expect(localUploadFilename('/uploads/foo/bar.jpg')).toBeNull();
    expect(
      localUploadFilename('http://localhost:3000/uploads/../secret.jpg'),
    ).toBeNull();
  });

  it('unlink só arquivos locais válidos', async () => {
    await deleteLocalUploads(
      [
        `${publicApi}/uploads/a.jpg`,
        'https://media.app-after.com.br/uploads/a.jpg',
        'https://lh3.googleusercontent.com/a/photo',
        `${publicApi}/uploads/a.jpg`,
      ],
      publicApi,
    );
    expect(unlinkMock).toHaveBeenCalledTimes(1);
    expect(unlinkMock.mock.calls[0][0]).toMatch(/uploads[\\/]a\.jpg$/);
  });
});
