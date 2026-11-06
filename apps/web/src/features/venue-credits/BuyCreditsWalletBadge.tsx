import { IconCrown, IconStar } from '../../components/icons/AfterIcons'

type Props = {
  commonBalance: number
  vipBalance: number
}

export function BuyCreditsWalletBadge({ commonBalance, vipBalance }: Props) {
  return (
    <div className="buy-wallet-badge" aria-label="Saldo da carteira">
      <div className="buy-wallet-part">
        <span className="buy-wallet-icon buy-wallet-icon--common">
          <IconStar size={18} />
        </span>
        <span className="buy-wallet-text">
          <span className="buy-wallet-label">Comum</span>
          <span className="buy-wallet-value buy-wallet-value--common">{commonBalance}</span>
        </span>
      </div>
      <span className="buy-wallet-sep" aria-hidden />
      <div className="buy-wallet-part">
        <span className="buy-wallet-icon buy-wallet-icon--vip">
          <IconCrown size={18} />
        </span>
        <span className="buy-wallet-text">
          <span className="buy-wallet-label">VIP</span>
          <span className="buy-wallet-value buy-wallet-value--vip">{vipBalance}</span>
        </span>
      </div>
    </div>
  )
}
