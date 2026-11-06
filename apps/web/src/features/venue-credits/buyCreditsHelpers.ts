import type { CreditPackage } from './types'
import { isVipCreditPackage } from '../../utils/vipCatalog'

export function packageSubtitle(credits: number): string {
  switch (credits) {
    case 1:
      return 'Ideal para testar'
    case 5:
      return 'Mais popular'
    case 10:
      return 'Melhor custo-benefício'
    default:
      return 'Pacote de créditos'
  }
}

export function offerTitle(pack: CreditPackage): string {
  const vip = isVipCreditPackage(pack)
  if (vip) {
    return pack.credits === 1 ? '1 crédito VIP' : `${pack.credits} créditos VIP`
  }
  return pack.credits === 1 ? '1 crédito' : `${pack.credits} créditos`
}

export function offerSubtitle(pack: CreditPackage): string {
  if (isVipCreditPackage(pack)) {
    return 'Destaque na página HOME e envio de aviso aos usuários'
  }
  return packageSubtitle(pack.credits)
}

export function unitPriceLabel(pack: CreditPackage): string | null {
  if (isVipCreditPackage(pack)) return null
  if (pack.credits <= 0 || pack.priceBrl == null) return null
  const unit = pack.priceBrl / pack.credits
  return `${formatMoney(unit)} por crédito`
}

export function packageSavings(
  pack: CreditPackage,
  commonPackages: CreditPackage[],
): number | null {
  if (isVipCreditPackage(pack) || pack.credits <= 1) return null
  const unit = commonPackages.find(
    (p) => p.credits === 1 && !isVipCreditPackage(p) && p.priceBrl != null,
  )
  if (!unit?.priceBrl || pack.priceBrl == null) return null
  const save = unit.priceBrl * pack.credits - pack.priceBrl
  return save >= 0.5 ? save : null
}

export function savingsLabel(
  pack: CreditPackage,
  commonPackages: CreditPackage[],
): string | null {
  const save = packageSavings(pack, commonPackages)
  if (save == null) return null
  return `Economize ${formatMoney(save)}`
}

export function formatMoney(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function buildOfferList(
  common: CreditPackage[],
  vip: CreditPackage | null,
): CreditPackage[] {
  return [...(vip ? [vip] : []), ...common]
}
