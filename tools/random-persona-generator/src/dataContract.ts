import { parseStringList } from './stringList.ts'

export const datasetName = 'nvidia/Nemotron-Personas-USA'
export const datasetVersion = '5b4cd35ab46490c1da1bd2b5a2324d6f871be180'
export const datasetUrl = `https://huggingface.co/datasets/${datasetName}/tree/${datasetVersion}`
export const licenseUrl = 'https://creativecommons.org/licenses/by/4.0/'
export const apiPath = '/tools/random-persona-generator/api/random'
export const fieldNames = [
  'uuid', 'professional_persona', 'sports_persona', 'arts_persona', 'travel_persona', 'culinary_persona',
  'persona', 'cultural_background', 'skills_and_expertise', 'skills_and_expertise_list',
  'hobbies_and_interests', 'hobbies_and_interests_list', 'career_goals_and_ambitions',
  'sex', 'age', 'marital_status', 'education_level', 'bachelors_field', 'occupation', 'city', 'state', 'zipcode', 'country',
] as const
export type FieldName = typeof fieldNames[number]
export type PersonaFields = Record<Exclude<FieldName, 'age'>, string> & { age: number }
export interface PersonaLists { skills: string[]; hobbies: string[] }
export interface PersonaSnapshot {
  schemaVersion: 2
  recordId: string
  datasetVersion: typeof datasetVersion
  sourceHash: string
  source: { publisher: 'NVIDIA'; dataset: typeof datasetName; config: 'default'; split: 'train'; url: typeof datasetUrl; license: 'CC BY 4.0'; licenseUrl: typeof licenseUrl }
  fields: PersonaFields
  lists: PersonaLists
}
export const source: PersonaSnapshot['source'] = { publisher: 'NVIDIA', dataset: datasetName, config: 'default', split: 'train', url: datasetUrl, license: 'CC BY 4.0', licenseUrl }

export function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object')
  return value as Record<string, unknown>
}

export function parseFields(value: unknown): PersonaFields {
  const fields = objectValue(value)
  for (const key of fieldNames) {
    if (!Object.hasOwn(fields, key)) throw new Error(`Missing field: ${key}`)
    if (key === 'age' ? !Number.isSafeInteger(fields[key]) : typeof fields[key] !== 'string') throw new Error(`Invalid field: ${key}`)
  }
  if (typeof fields.uuid !== 'string' || !/^[a-f0-9]{32,36}$/.test(fields.uuid.replaceAll('-', ''))) throw new Error('Invalid UUID')
  return Object.fromEntries(fieldNames.map(key => [key, fields[key]])) as PersonaFields
}

export function sourceLists(fields: PersonaFields): PersonaLists {
  return { skills: parseSourceList(fields.skills_and_expertise_list), hobbies: parseSourceList(fields.hobbies_and_interests_list) }
}

// A single redundant list wrapper is a documented source anomaly; keep its original field.
function outerList(input: string) { return /^\[\s*(\[[\s\S]*\])\s*\]$/.exec(input.trim())?.[1] }
function parseSourceList(input: string) { return parseStringList(outerList(input) ?? input) }
export function normalizedListFields(fields: PersonaFields) {
  return (['skills_and_expertise_list', 'hobbies_and_interests_list'] as const).filter(key => outerList(fields[key]) !== undefined)
}

export function canonicalFields(fields: PersonaFields) { return JSON.stringify(fieldNames.map(key => fields[key])) }

export function parseSnapshot(value: unknown): PersonaSnapshot {
  const snapshot = objectValue(value)
  const fields = parseFields(snapshot.fields)
  const provenance = objectValue(snapshot.source)
  const lists = objectValue(snapshot.lists)
  const expectedLists = sourceLists(fields)
  if (snapshot.schemaVersion !== 2 || snapshot.recordId !== fields.uuid || snapshot.datasetVersion !== datasetVersion
    || typeof snapshot.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.sourceHash)
    || Object.entries(source).some(([key, expected]) => provenance[key] !== expected)
    || JSON.stringify(lists.skills) !== JSON.stringify(expectedLists.skills)
    || JSON.stringify(lists.hobbies) !== JSON.stringify(expectedLists.hobbies)) throw new Error('Invalid persona response')
  return { schemaVersion: 2, recordId: fields.uuid, datasetVersion, sourceHash: snapshot.sourceHash, source: { ...source }, fields, lists: expectedLists }
}
