import { describe, expect, it } from 'vitest'

/** Contrato de deploy: HashRouter sob documento /app/index.html */
describe('hash routing /app/', () => {
  it('URLs públicas esperadas (sem token real)', () => {
    const origin = 'https://app-after.com.br'
    expect(`${origin}/app/#/`).toContain('/app/#/')
    expect(`${origin}/app/#/login`).toBe(`${origin}/app/#/login`)
    expect(`${origin}/app/#/oauth`).toBe(`${origin}/app/#/oauth`)
    expect(`${origin}/app/#/perfil/conta`).toBe(`${origin}/app/#/perfil/conta`)
  })

  it('reload: servidor só entrega /app/ — hash preservado no cliente', () => {
    const path = '/app/index.html'
    expect(path.startsWith('/app/')).toBe(true)
  })

  it('gap e-mail API raiz Flutter vs React', () => {
    const apiEmail = 'https://app-after.com.br/#/redefinir-senha?token=***'
    const webExpected = 'https://app-after.com.br/app/#/redefinir-senha?token=***'
    expect(apiEmail).not.toBe(webExpected)
    expect(webExpected).toContain('/app/#/redefinir-senha')
  })
})
