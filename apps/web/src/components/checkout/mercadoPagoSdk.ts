const SDK_URL = 'https://sdk.mercadopago.com/js/v2'

type CardPaymentForm = {
  token: string
  payment_method_id: string
  payment_type_id?: string
  installments?: number
}

type CardPaymentController = {
  unmount: () => void | Promise<void>
}

type MercadoPagoInstance = {
  bricks: () => {
    create: (
      brick: 'cardPayment',
      containerId: string,
      settings: Record<string, unknown>,
    ) => Promise<CardPaymentController>
  }
}

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => MercadoPagoInstance
  }
}

let sdkLoad: Promise<void> | null = null

export function loadMercadoPagoSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve()
  if (sdkLoad) return sdkLoad
  sdkLoad = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-after-mp-sdk="v2"]')
    const script =
      existing instanceof HTMLScriptElement
        ? existing
        : (() => {
            const el = document.createElement('script')
            el.src = SDK_URL
            el.async = true
            el.setAttribute('data-after-mp-sdk', 'v2')
            document.head?.append(el)
            return el
          })()
    script.addEventListener('load', () => {
      if (window.MercadoPago) resolve()
      else reject(new Error('Mercado Pago SDK missing'))
    })
    script.addEventListener('error', () => reject(new Error('Mercado Pago SDK failed to load')))
    if (window.MercadoPago) resolve()
  })
  return sdkLoad
}

export type CardBrickSubmitPayload = {
  token: string
  paymentMethodId: string
  paymentType: string
  installments: number
}

export async function mountCardPaymentBrick(input: {
  containerId: string
  publicKey: string
  amount: number
  payerEmail?: string | null
  onSubmit: (form: CardBrickSubmitPayload) => Promise<void>
  onError: (message: string) => void
}): Promise<() => Promise<void>> {
  await loadMercadoPagoSdk()
  const MercadoPago = window.MercadoPago
  if (!MercadoPago) throw new Error('Mercado Pago SDK missing')
  const mp = new MercadoPago(input.publicKey, { locale: 'pt-BR' })
  const initialization: Record<string, unknown> = { amount: input.amount }
  const email = input.payerEmail?.trim()
  if (email) initialization.payer = { email }

  const controller = await mp.bricks().create('cardPayment', input.containerId, {
    initialization,
    customization: {
      paymentMethods: {
        maxInstallments: 1,
        types: { excluded: ['debit_card', 'prepaid_card'] },
      },
      visual: {
        style: {
          theme: 'default',
          customVariables: {
            textPrimaryColor: '#282829',
            textSecondaryColor: '#8A9391',
            inputBackgroundColor: '#FFFFFF',
            formBackgroundColor: '#FFFFFF',
            baseColor: '#F58634',
            outlinePrimaryColor: '#F58634',
            buttonTextColor: '#FFFFFF',
          },
        },
      },
    },
    callbacks: {
      onReady: () => {},
      onError: () => {
        input.onError('Não foi possível validar o cartão no formulário seguro.')
      },
      onSubmit: async (raw: CardPaymentForm) => {
        const token = raw.token?.trim()
        const method = raw.payment_method_id?.trim()
        if (!token || !method) {
          input.onError('O formulário seguro não devolveu um pagamento utilizável.')
          throw new Error('invalid brick payload')
        }
        const paymentType = raw.payment_type_id?.trim() || 'credit_card'
        const installments = raw.installments ?? 1
        await input.onSubmit({
          token,
          paymentMethodId: method,
          paymentType,
          installments,
        })
      },
    },
  })

  return async () => {
    try {
      await controller.unmount()
    } catch {
      /* ignore */
    }
  }
}
