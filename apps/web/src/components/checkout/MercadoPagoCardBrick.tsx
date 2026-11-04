import { useEffect, useId, useRef } from 'react'
import { mountCardPaymentBrick, type CardBrickSubmitPayload } from './mercadoPagoSdk'

type Props = {
  publicKey: string
  amount: number
  payerEmail?: string | null
  enabled: boolean
  onSubmit: (form: CardBrickSubmitPayload) => Promise<void>
  onError: (message: string) => void
}

export function MercadoPagoCardBrick(props: Props) {
  const reactId = useId()
  const containerId = `after-card-brick-${reactId.replace(/:/g, '')}`
  const unmountRef = useRef<(() => Promise<void>) | null>(null)
  const generationRef = useRef(0)
  const onSubmitRef = useRef(props.onSubmit)
  const onErrorRef = useRef(props.onError)
  onSubmitRef.current = props.onSubmit
  onErrorRef.current = props.onError

  useEffect(() => {
    if (!props.enabled || !props.publicKey || props.amount <= 0) return
    const generation = ++generationRef.current
    let cancelled = false

    void (async () => {
      try {
        await unmountRef.current?.()
        if (cancelled || generation !== generationRef.current) return
        unmountRef.current = await mountCardPaymentBrick({
          containerId,
          publicKey: props.publicKey,
          amount: props.amount,
          payerEmail: props.payerEmail,
          onSubmit: (form) => onSubmitRef.current(form),
          onError: (message) => onErrorRef.current(message),
        })
      } catch {
        if (!cancelled) onErrorRef.current('Não foi possível abrir o formulário seguro do cartão.')
      }
    })()

    return () => {
      cancelled = true
      generationRef.current += 1
      void unmountRef.current?.()
      unmountRef.current = null
    }
  }, [props.enabled, props.publicKey, props.amount, props.payerEmail, containerId])

  if (!props.enabled) return null

  return <div id={containerId} className="w-100" style={{ minHeight: 220 }} />
}
