import perfDataUrl from '../generated/perfData.json?url'
import type { PerfRow, PerfStatus } from './perfTypes'

type PerfRowTuple = [
  id: number,
  text: string,
  caseText: string,
  alphanumeric: string,
  caseAlphanumeric: string,
  score: number,
  bucketNumber: number,
  createdAt: string,
  status: PerfStatus,
  group: string,
  subgroup: string,
  tags: string[],
]

interface PerfDataFixture {
  rowCount: number
  rows: PerfRowTuple[]
  seed: number
  version: 1
}

let allRows: PerfRow[] | undefined
let preloadPromise: Promise<void> | undefined
const rowSlices = new Map<number, PerfRow[]>()

function tupleToRow(tuple: PerfRowTuple): PerfRow {
  return {
    id: tuple[0],
    text: tuple[1],
    caseText: tuple[2],
    alphanumeric: tuple[3],
    caseAlphanumeric: tuple[4],
    score: tuple[5],
    bucketNumber: tuple[6],
    createdAt: new Date(tuple[7]),
    status: tuple[8],
    group: tuple[9],
    subgroup: tuple[10],
    tags: tuple[11],
  }
}

export async function preloadPerfData() {
  if (allRows) {
    return
  }

  preloadPromise ??= (async () => {
    const response = await fetch(perfDataUrl)
    if (!response.ok) {
      throw new Error(`Failed to load performance fixture: ${response.status}`)
    }

    const fixture = (await response.json()) as PerfDataFixture
    allRows = fixture.rows.map(tupleToRow)
  })()

  await preloadPromise
}

export function getPerfData(rowCount: number): PerfRow[] {
  if (!allRows) {
    throw new Error('Performance fixture has not been loaded')
  }
  if (rowCount > allRows.length) {
    throw new Error(
      `Performance fixture has ${allRows.length.toLocaleString()} rows, requested ${rowCount.toLocaleString()}`,
    )
  }

  const cached = rowSlices.get(rowCount)
  if (cached) {
    return cached
  }

  const slice = allRows.slice(0, rowCount)
  rowSlices.set(rowCount, slice)
  return slice
}
