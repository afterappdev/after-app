import { IconCrown, IconStar } from '../../components/icons/AfterIcons'

type Props = {
  commonBalance: number
  vipBalance: number
  onHistoryClick: () => void
}

export function BuyCreditsBalanceCard({ commonBalance, vipBalance, onHistoryClick }: Props) {
  return (
    <div className="buy-balance-card">
      <div className="buy-balance-row">
        <div className="buy-balance-col">
          <span className="buy-balance-icon buy-balance-icon--common">
            <IconStar size={20} />
          </span>
          <div>
            <p className="buy-balance-label">Créditos comuns</p>
            <p className="buy-balance-value">{commonBalance}</p>
            <p className="buy-balance-hint">créditos disponíveis</p>
          </div>
        </div>
        <div className="buy-balance-divider" aria-hidden />
        <div className="buy-balance-col">
          <span className="buy-balance-icon buy-balance-icon--vip">
            <IconCrown size={18} />
          </span>
          <div>
            <p className="buy-balance-label">Créditos VIP</p>
            <p className="buy-balance-value">{vipBalance}</p>
            <p className="buy-balance-hint">créditos disponíveis</p>
          </div>
        </div>
      </div>
      <button type="button" className="buy-balance-history-link" onClick={onHistoryClick}>
        Últimas compras
      </button>
    </div>
  )
}
