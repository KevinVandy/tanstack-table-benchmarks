export interface Person {
  id: number
  firstName: string
  lastName: string
  age: number
  visits: number
  status: string
  progress: number
  createdAt: Date
  [key: `field_${number}`]: string | number | Date
}

const firstNames = ['Ada', 'Grace', 'Linus', 'Margaret', 'Donald', 'Barbara']
const lastNames = ['Lovelace', 'Hopper', 'Torvalds', 'Hamilton', 'Knuth', 'Liskov']
const statuses = ['single', 'relationship', 'complicated']

export function makeData(rowCount: number): Person[] {
  return Array.from({ length: rowCount }, (_, index) => ({
    id: index + 1,
    firstName: firstNames[index % firstNames.length],
    lastName: lastNames[index % lastNames.length],
    age: 18 + (index % 63),
    visits: (index * 13) % 1000,
    status: statuses[index % statuses.length],
    progress: (index * 7) % 100,
    createdAt: new Date(Date.UTC(2020 + (index % 6), index % 12, (index % 28) + 1)),
  }))
}

export function makeWideData(rowCount: number, columnCount: number): Person[] {
  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const row: Person = {
      id: rowIndex + 1,
      firstName: firstNames[rowIndex % firstNames.length],
      lastName: lastNames[rowIndex % lastNames.length],
      age: 18 + (rowIndex % 63),
      visits: (rowIndex * 13) % 1000,
      status: statuses[rowIndex % statuses.length],
      progress: (rowIndex * 7) % 100,
      createdAt: new Date(
        Date.UTC(2020 + (rowIndex % 6), rowIndex % 12, (rowIndex % 28) + 1),
      ),
    }

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
      row[`field_${columnIndex}`] = `R${rowIndex} C${columnIndex}`
    }

    return row
  })
}

export function makeColumnKeys(columnCount: number) {
  return Array.from({ length: columnCount }, (_, index) => `field_${index}` as const)
}
