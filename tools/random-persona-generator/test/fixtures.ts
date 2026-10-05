import { createHash } from 'node:crypto'
import { canonicalFields, datasetName, datasetVersion, datasetUrl, licenseUrl } from '../src/dataContract.ts'
import type { PersonaSnapshot } from '../src/dataContract.ts'

export const fields = {
  uuid: 'eb31fcc31eb345acb316d9fc051d6b8e',
  professional_persona: 'Organizes deliveries.\n  Preserved whitespace.\n',
  sports_persona: 'Plays basketball', arts_persona: 'Visits exhibitions',
  travel_persona: 'Plans road trips', culinary_persona: 'Cooks Tex-Mex',
  persona: 'A curious planner.', cultural_background: 'Texan heritage.',
  skills_and_expertise: 'Supply chain management.', skills_and_expertise_list: "['Planning', \"Driver's scheduling\"]",
  hobbies_and_interests: 'Board games.', hobbies_and_interests_list: "['Chess']",
  career_goals_and_ambitions: 'Lead a team.', sex: 'Male', age: 40,
  marital_status: 'married_present', education_level: 'bachelors', bachelors_field: '',
  occupation: 'logistician', city: 'Test City', state: 'TX', zipcode: '00123', country: 'USA',
}
export const lists = { skills: ['Planning', "Driver's scheduling"], hobbies: ['Chess'] }
export const snapshot: PersonaSnapshot = {
  schemaVersion: 2, recordId: fields.uuid, datasetVersion, sourceHash: createHash('sha256').update(canonicalFields(fields)).digest('hex'),
  source: { publisher: 'NVIDIA', dataset: datasetName, config: 'default', split: 'train', url: datasetUrl, license: 'CC BY 4.0', licenseUrl }, fields, lists,
}
