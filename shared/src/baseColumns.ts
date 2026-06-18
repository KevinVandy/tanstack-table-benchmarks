import type { Person } from './makeData'

export const baseColumnDefs = [
  { accessorKey: 'id', header: 'ID', size: 60 },
  {
    accessorKey: 'firstName',
    header: 'First Name',
    cell: (value: unknown) => String(value),
    size: 130,
  },
  {
    accessorKey: 'lastName',
    header: 'Last Name',
    cell: (value: unknown) => String(value),
    size: 130,
  },
  { accessorKey: 'age', header: 'Age', size: 60 },
  { accessorKey: 'visits', header: 'Visits', size: 80 },
  { accessorKey: 'status', header: 'Status', size: 130 },
  { accessorKey: 'progress', header: 'Progress', size: 100 },
  {
    accessorKey: 'createdAt',
    header: 'Created At',
    cell: (value: unknown) => (value as Date).toISOString().slice(0, 10),
    size: 120,
  },
] satisfies Array<{
  accessorKey: keyof Person
  header: string
  cell?: (value: unknown) => string
  size: number
}>
