import type { GeneratedField, RegionId } from './profile'

export type GeneratedFieldValue = Pick<
  GeneratedField,
  'localValue' | 'englishValue' | 'englishStatus' | 'conversionStandard'
>

export interface RegionFieldDefinition {
  readonly id: string
  readonly regionId: RegionId
  readonly label: string
  readonly generate: () => GeneratedFieldValue
}

export interface RegionFieldRegistry {
  fieldsFor(regionId: RegionId): readonly RegionFieldDefinition[]
}

export function createRegionFieldRegistry(fields: readonly RegionFieldDefinition[]): RegionFieldRegistry {
  const fieldsByRegion = new Map<RegionId, RegionFieldDefinition[]>()
  const identifiers = new Set<string>()

  for (const definition of fields) {
    if (!definition.id.trim() || !definition.label.trim()) throw new Error('Region extension fields need an id and label')
    if (['name', 'birthDate', 'address', 'postalCode', 'email', 'phone'].includes(definition.id)) {
      throw new Error(`Region extension field id conflicts with a common field: ${definition.id}`)
    }

    const key = `${definition.regionId}:${definition.id}`
    if (identifiers.has(key)) throw new Error(`Duplicate field id for region: ${definition.id}`)
    identifiers.add(key)
    const regionFields = fieldsByRegion.get(definition.regionId) ?? []
    regionFields.push(definition)
    fieldsByRegion.set(definition.regionId, regionFields)
  }

  for (const regionFields of fieldsByRegion.values()) Object.freeze(regionFields)

  return Object.freeze({
    fieldsFor(regionId: RegionId) {
      return fieldsByRegion.get(regionId) ?? []
    },
  })
}

export const emptyRegionFieldRegistry = createRegionFieldRegistry([])
