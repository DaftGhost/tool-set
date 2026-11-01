const scenarioSwatches = [
  'bg-scenario-0',
  'bg-scenario-1',
  'bg-scenario-2',
  'bg-scenario-3',
  'bg-scenario-4',
  'bg-scenario-5',
  'bg-scenario-6',
  'bg-scenario-7',
  'bg-scenario-8',
  'bg-scenario-9',
  'bg-scenario-10',
  'bg-scenario-11',
  'bg-scenario-12',
  'bg-scenario-13',
  'bg-scenario-14',
  'bg-scenario-15',
] as const

export function scenarioSwatchClass(index: number): string {
  return scenarioSwatches[index % scenarioSwatches.length] ?? scenarioSwatches[0]
}

export function scenarioColor(index: number): string {
  return `var(--color-scenario-${index % scenarioSwatches.length})`
}
