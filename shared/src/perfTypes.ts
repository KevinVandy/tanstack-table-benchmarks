export type PerfStatus = 'single' | 'relationship' | 'complicated'

export interface PerfRow {
  id: number
  text: string
  caseText: string
  alphanumeric: string
  caseAlphanumeric: string
  score: number
  bucketNumber: number
  createdAt: Date
  status: PerfStatus
  group: string
  subgroup: string
  tags: string[]
}
