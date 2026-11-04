import type { ApiClient } from './client'

export type ReportTargetType = 'VENUE' | 'BANNER' | 'PHOTO' | 'VIDEO' | 'REVIEW'

export type ReportReason =
  | 'INAPPROPRIATE'
  | 'SPAM'
  | 'MISLEADING'
  | 'VIOLENCE'
  | 'SEXUAL'
  | 'HATE'
  | 'COPYRIGHT'
  | 'OTHER'

export async function submitReport(
  api: ApiClient,
  body: {
    targetType: ReportTargetType
    targetId: string
    reason: ReportReason
    description?: string
  },
): Promise<void> {
  await api.post('/reports', body)
}
