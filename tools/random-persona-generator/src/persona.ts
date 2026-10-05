import { normalizedListFields } from './dataContract.ts'
import type { FieldName, PersonaFields, PersonaSnapshot } from './dataContract.ts'
import { personalPronoun, replaceNameReferences } from './personaPronouns.ts'

export interface TextSection { title: string; text: string; items?: string[] }
export interface PersonaPresentation {
  name: string | null
  overview: { title: string; value: string }[]
  core: string
  professional: string
  interests: TextSection[]
  details: TextSection[]
  warnings: string[]
}

const overviewFields = [
  ['性别（源字段 sex）', 'sex'], ['城市', 'city'], ['州', 'state'], ['邮编', 'zipcode'], ['国家', 'country'],
  ['职业', 'occupation'], ['婚姻状态', 'marital_status'], ['教育程度', 'education_level'], ['本科专业', 'bachelors_field'],
] as const
const interests = [['运动', 'sports_persona'], ['艺术', 'arts_persona'], ['旅行', 'travel_persona'], ['烹饪', 'culinary_persona']] as const
const details = [['文化背景', 'cultural_background'], ['技能与专长', 'skills_and_expertise'], ['兴趣爱好', 'hobbies_and_interests'], ['职业目标', 'career_goals_and_ambitions']] as const
const textValue = (value: string | number) => value === '' ? 'Not provided' : String(value)
const nameWord = "[\\p{Lu}\\p{Lt}][\\p{L}\\p{M}.'’\\p{Pd}]*"
const nameStart = new RegExp(`^(${nameWord}(?:\\s+(?:(?:de|del|da|di|dos|van|von|la|bin|al)\\s+)*${nameWord}){0,5})(?=\\s|[,;:.!?]|$)`, 'u')
const narrativeFields = ['persona', 'professional_persona', ...interests.map(([, key]) => key), ...details.map(([, key]) => key)] as const

function narrativeName(fields: PersonaFields): string | null {
  const candidates = new Set<string>()
  for (const key of narrativeFields) {
    const name = fields[key].trimStart().match(nameStart)?.[1]?.replace(/['’]s$/, '')
    if (name && !/^(A|An|The|This|That|His|Her|Their|He|She|They)\b/.test(name)) candidates.add(name)
  }
  const corroborated = [...candidates].map(name => {
    const pattern = namePattern(name)
    return { name, count: narrativeFields.filter(key => pattern.test(fields[key])).length }
  }).filter(({ name, count }) => count >= (name.includes(' ') ? 2 : 3))
  const ranked = corroborated.filter(({ name }) => !corroborated.some(other => other.name.startsWith(name + ' '))).sort((a, b) => b.count - a.count)
  const best = ranked[0]
  if (!best || best.count === ranked[1]?.count) return null
  return best.name
}

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const namePattern = (name: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapePattern(name)}(?![\\p{L}\\p{N}])`, 'u')
function narrativeText(value: string, name: string | null, pronoun: ReturnType<typeof personalPronoun>): string {
  return textValue(name ? replaceNameReferences(value, name, pronoun) : value)
}

export function presentPersona(snapshot: PersonaSnapshot): PersonaPresentation {
  const { fields, lists } = snapshot
  const name = narrativeName(fields)
  const pronoun = personalPronoun(fields)
  const sections = (entries: readonly (readonly [string, FieldName])[]) => entries.map(([title, key]) => ({ title, text: narrativeText(String(fields[key]), name, pronoun) }))
  return {
    name,
    overview: overviewFields.map(([title, key]) => ({ title, value: textValue(fields[key]) })),
    core: narrativeText(fields.persona, name, pronoun), professional: narrativeText(fields.professional_persona, name, pronoun), interests: sections(interests),
    details: [...sections(details), { title: '技能列表', text: '', items: lists.skills }, { title: '兴趣列表', text: '', items: lists.hobbies }],
    warnings: [...(fields.age <= 0 ? [`年龄源字段需核查：${fields.age}`] : []), ...normalizedListFields(fields).map(key => `列表已去掉一层外部包装：${key}；原始字段保持不变。`)],
  }
}

export function formatCharacterSheet(snapshot: PersonaSnapshot): string {
  const { fields: f, lists, source, recordId, datasetVersion } = snapshot
  const name = narrativeName(f)
  const pronoun = personalPronoun(f)
  const narrative = (value: string) => narrativeText(value, name, pronoun)
  const bullets = (items: string[]) => items.length ? items.map(item => `- ${item}`).join('\n') : 'Not provided'
  const overview = [
    ['Name', name ?? 'Not identified'],
    ['Age', f.age], ['Sex', f.sex], ['City', f.city], ['State', f.state], ['Zipcode', f.zipcode], ['Country', f.country],
    ['Occupation', f.occupation], ['Marital status', f.marital_status], ['Education', f.education_level], ["Bachelor's field", f.bachelors_field],
  ].map(([title, value]) => `${title}: ${textValue(value)}`).join('\n')
  const warnings = [...(f.age <= 0 ? [`Source field needs review: age=${f.age}`] : []), ...normalizedListFields(f).map(key => `Removed one outer list wrapper: ${key}; original field retained.`)]
  const warning = warnings.length ? `\n${warnings.join('\n')}\n` : ''
  return [
    '# Character Profile', `## Overview\n${overview}${warning}`,
    `## Persona in Different Contexts\n### Core Persona\n${narrative(f.persona)}\n\n### Professional Life\n${narrative(f.professional_persona)}`,
    `### Interests & Hobbies\n- As a sports fan: ${narrative(f.sports_persona)}\n- As an art lover: ${narrative(f.arts_persona)}\n- As a traveler: ${narrative(f.travel_persona)}\n- As a cook: ${narrative(f.culinary_persona)}`,
    `### Detailed Profile\n**Cultural Background:** ${narrative(f.cultural_background)}\n\n**Skills & Expertise:** ${narrative(f.skills_and_expertise)}\n\n**Skills List:**\n${bullets(lists.skills)}\n\n**Hobbies & Interests:** ${narrative(f.hobbies_and_interests)}\n\n**Hobbies List:**\n${bullets(lists.hobbies)}\n\n**Career Goals & Ambitions:** ${narrative(f.career_goals_and_ambitions)}`,
    `## Source\n${source.publisher} — ${source.dataset}, ${source.license}\n${source.url} | ${source.licenseUrl}\nUUID: ${recordId} | Revision: ${datasetVersion}\nChanges: Reformatted from source fields.${name ? ' Name extracted from matching narratives; repeated name references replaced with personal pronouns.' : ''}`,
  ].join('\n\n') + '\n'
}
