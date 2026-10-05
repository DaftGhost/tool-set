import type { PersonaFields } from './dataContract.ts'

type Pronoun = 'he' | 'she' | 'they'
const forms = {
  he: { subject: 'he', object: 'him', possessive: 'his' },
  she: { subject: 'she', object: 'her', possessive: 'her' },
  they: { subject: 'they', object: 'them', possessive: 'their' },
}
const evidence = { he: /\b(?:he|him|his|himself)\b/i, she: /\b(?:she|her|hers|herself)\b/i, they: /\b(?:they|them|their|theirs|themselves)\b/i }
const narratives = ['persona', 'professional_persona', 'sports_persona', 'arts_persona', 'travel_persona', 'culinary_persona', 'cultural_background', 'skills_and_expertise', 'hobbies_and_interests', 'career_goals_and_ambitions'] as const

export function personalPronoun(fields: PersonaFields): Pronoun {
  const ranked = (Object.keys(evidence) as Pronoun[]).map(pronoun => ({ pronoun, count: narratives.filter(key => evidence[pronoun].test(fields[key])).length })).sort((a, b) => b.count - a.count)
  const supported = ranked.filter(item => item.count >= 2)
  return supported.length === 1 ? supported[0]!.pronoun : 'they'
}

function pluralVerb(verb: string): string {
  const irregular: Record<string, string> = { is: 'are', was: 'were', has: 'have', does: 'do' }
  if (Object.hasOwn(irregular, verb)) return irregular[verb]!
  if (/ies$/.test(verb)) return verb.slice(0, -3) + 'y'
  if (/(?:ss|zz|x|ch|sh|o)es$/.test(verb) || verb === 'focuses') return verb.slice(0, -2)
  if (/s$/.test(verb) && !/ss$/.test(verb) && !['focus', 'bias'].includes(verb)) return verb.slice(0, -1)
  return verb
}

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const continuation = '(\\s+(?:also\\s+)?[A-Za-z]+|,\\s*[^,.;!?\\n]{1,500},\\s*(?:also\\s+)?[A-Za-z]+)?'

export function replaceNameReferences(value: string, name: string, pronoun: Pronoun): string {
  const replacement = (text: string, offset: number, possessive = '', tail = '') => {
    const prefix = text.slice(0, offset)
    const object = /\b(?:for|with|to|from|about|of|without|helps?|supports?|mentors?|advises?|encourages?)\s+$/i.test(prefix)
    const form = possessive ? 'possessive' : object ? 'object' : 'subject'
    const word = forms[pronoun][form]
    const reference = /(?:^|[.!?\n])\s*$/.test(prefix) ? word[0]!.toUpperCase() + word.slice(1) : word
    const rest = pronoun === 'they' && form === 'subject' ? tail.replace(/[A-Za-z]+$/, pluralVerb) : tail
    return reference + rest
  }
  const full = new RegExp(`(?<![\\p{L}\\p{N}])${escapePattern(name)}(?![\\p{L}\\p{N}])(['’]s)?${continuation}`, 'gu')
  const text = value.replace(full, (_, possessive: string, tail: string, offset: number) => replacement(value, offset, possessive, tail))
  const first = escapePattern(name.split(/\s+/)[0]!)
  const short = new RegExp(`(?<![\\p{L}\\p{N}])${first}(?=[’']s\\b|\\s+\\p{Ll}|[,;])(['’]s)?${continuation}`, 'gu')
  return text.replace(short, (_, possessive: string, tail: string, offset: number) => replacement(text, offset, possessive, tail))
}
