import type { ReactNode } from 'react'
import { AfterLogo } from './AfterLogo'

type Props = {
  children: ReactNode
  logoHeight?: number
  wide?: boolean
}

export function AfterAuthCard({ children, logoHeight = 72, wide }: Props) {
  return (
    <div className={wide ? 'after-auth-card after-auth-card--wide' : 'after-auth-card'}>
      <div className="text-center mb-2">
        <AfterLogo height={logoHeight} className="d-inline-block" />
      </div>
      {children}
    </div>
  )
}
