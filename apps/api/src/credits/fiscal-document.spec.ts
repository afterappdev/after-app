import { BadRequestException } from '@nestjs/common';
import {
  digitsOnly,
  isValidCnpj,
  isValidCpf,
  resolveFiscalSnapshot,
} from './fiscal-document';

describe('fiscal-document', () => {
  it('aceita compra sem dados fiscais', () => {
    expect(resolveFiscalSnapshot(undefined)).toEqual({
      invoiceRequested: false,
      fiscalPersonType: null,
      fiscalName: null,
      fiscalDocument: null,
      fiscalEmail: null,
    });
    expect(resolveFiscalSnapshot({ invoiceRequested: false })).toEqual({
      invoiceRequested: false,
      fiscalPersonType: null,
      fiscalName: null,
      fiscalDocument: null,
      fiscalEmail: null,
    });
  });

  it('invoiceRequested=false limpa campos enviados', () => {
    const snapshot = resolveFiscalSnapshot({
      invoiceRequested: false,
      fiscalPersonType: 'CPF',
      fiscalName: 'João',
      fiscalDocument: '123.456.789-09',
      fiscalEmail: 'a@b.com',
    });
    expect(snapshot.fiscalDocument).toBeNull();
    expect(snapshot.fiscalName).toBeNull();
    expect(snapshot.fiscalEmail).toBeNull();
    expect(snapshot.fiscalPersonType).toBeNull();
  });

  it('valida CPF verdadeiro e rejeita inválido', () => {
    expect(isValidCpf('12345678909')).toBe(true);
    expect(isValidCpf('123.456.789-09')).toBe(true);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('12345678900')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
  });

  it('valida CNPJ verdadeiro e rejeita inválido', () => {
    expect(isValidCnpj('11444777000161')).toBe(true);
    expect(isValidCnpj('11.444.777/0001-61')).toBe(true);
    expect(isValidCnpj('00000000000000')).toBe(false);
    expect(isValidCnpj('11444777000162')).toBe(false);
  });

  it('normaliza documento, nome e e-mail', () => {
    const snapshot = resolveFiscalSnapshot({
      invoiceRequested: true,
      fiscalPersonType: 'cpf',
      fiscalName: '  João da Silva  ',
      fiscalDocument: '123.456.789-09',
      fiscalEmail: '  Email@Exemplo.COM  ',
    });
    expect(snapshot.fiscalName).toBe('João da Silva');
    expect(snapshot.fiscalDocument).toBe('12345678909');
    expect(snapshot.fiscalEmail).toBe('email@exemplo.com');
    expect(snapshot.fiscalPersonType).toBe('CPF');
    expect(digitsOnly('123.456.789-09')).toBe('12345678909');
  });

  it('exige campos quando invoiceRequested=true', () => {
    expect(() =>
      resolveFiscalSnapshot({ invoiceRequested: true }),
    ).toThrow(BadRequestException);
    expect(() =>
      resolveFiscalSnapshot({
        invoiceRequested: true,
        fiscalPersonType: 'CPF',
        fiscalName: 'João',
        fiscalDocument: '12345678909',
        fiscalEmail: 'invalido',
      }),
    ).toThrow(BadRequestException);
    try {
      resolveFiscalSnapshot({
        invoiceRequested: true,
        fiscalPersonType: 'CPF',
        fiscalName: 'João',
        fiscalDocument: '12345678900',
        fiscalEmail: 'a@b.com',
      });
      fail('expected invalid CPF');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect(String(error)).not.toContain('12345678900');
    }
    try {
      resolveFiscalSnapshot({
        invoiceRequested: true,
        fiscalPersonType: 'CNPJ',
        fiscalName: 'Empresa LTDA',
        fiscalDocument: '11444777000162',
        fiscalEmail: 'a@b.com',
      });
      fail('expected invalid CNPJ');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect(String(error)).not.toContain('11444777000162');
    }
  });
});
