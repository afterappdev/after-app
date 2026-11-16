import { BadRequestException } from '@nestjs/common';
import {
  isPublicMenuUrl,
  MENU_URL_INVALID,
  normalizeMenuUrl,
} from './venue-menu-url';

describe('normalizeMenuUrl', () => {
  it('aceita https e http', () => {
    expect(normalizeMenuUrl('https://menu.exemplo.com/p')).toBe(
      'https://menu.exemplo.com/p',
    );
    expect(normalizeMenuUrl('http://localhost:8080/cardapio')).toBe(
      'http://localhost:8080/cardapio',
    );
  });

  it('limpa vazio para null', () => {
    expect(normalizeMenuUrl('   ')).toBeNull();
    expect(normalizeMenuUrl(null)).toBeNull();
  });

  it('rejeita protocolo inseguro', () => {
    expect(() => normalizeMenuUrl('javascript:alert(1)')).toThrow(
      BadRequestException,
    );
    try {
      normalizeMenuUrl('ftp://files.test/menu');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(MENU_URL_INVALID);
    }
  });
});

describe('isPublicMenuUrl', () => {
  it('só expõe http(s) preenchido', () => {
    expect(isPublicMenuUrl('https://a.test')).toBe(true);
    expect(isPublicMenuUrl('')).toBe(false);
    expect(isPublicMenuUrl('javascript:x')).toBe(false);
  });
});
