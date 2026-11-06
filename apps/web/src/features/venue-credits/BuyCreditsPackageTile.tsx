import { IconCrown, IconStar } from '../../components/icons/AfterIcons'
import { isVipCreditPackage, vipWebCheckoutPack } from '../../utils/vipCatalog'
import type { CreditPackage } from './types'
import {
  formatMoney,
  offerSubtitle,
  offerTitle,
  savingsLabel,
  unitPriceLabel,
} from './buyCreditsHelpers'

type Props = {
  pack: CreditPackage
  selected: boolean
  commonPackages: CreditPackage[]
  onSelect: () => void
}

export function BuyCreditsPackageTile({
  pack,
  selected,
  commonPackages,
  onSelect,
}: Props) {
  const vip = isVipCreditPackage(pack)
  const unit = unitPriceLabel(pack)
  const savings = savingsLabel(pack, commonPackages)
  const price = vip
    ? (vipWebCheckoutPack(pack)?.priceBrl ?? pack.priceBrl ?? pack.referencePriceBrl)
    : pack.priceBrl

  return (
    <button
      type="button"
      className={`buy-pack-tile ${vip ? 'buy-pack-tile--vip' : ''} ${selected ? 'buy-pack-tile--selected' : ''}`}
      onClick={onSelect}
    >
      <span
        className={`buy-pack-mark ${selected ? 'buy-pack-mark--on' : ''} ${vip ? 'buy-pack-mark--vip' : ''}`}
        aria-hidden
      />
      <span className={`buy-pack-icon ${vip ? 'buy-pack-icon--vip' : 'buy-pack-icon--common'}`}>
        {vip ? <IconCrown size={18} /> : <IconStar size={20} />}
      </span>
      <span className="buy-pack-body">
        <span className="buy-pack-head">
          <span className="buy-pack-title">{offerTitle(pack)}</span>
          {vip ? <span className="buy-pack-vip-badge">VIP</span> : null}
          <span className={`buy-pack-price ${vip ? 'buy-pack-price--vip' : ''}`}>
            {formatMoney(price)}
          </span>
        </span>
        <span className="buy-pack-sub">{offerSubtitle(pack)}</span>
        {unit || savings ? (
          <span className="buy-pack-meta">
            {unit ? <span>{unit}</span> : null}
            {savings ? <span className="buy-pack-save">{savings}</span> : null}
          </span>
        ) : null}
      </span>
    </button>
  )
}
