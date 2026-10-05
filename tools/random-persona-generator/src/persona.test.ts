import { describe, expect, it } from 'vitest'
import { formatCharacterSheet, presentPersona } from './persona.ts'
import { fields, snapshot } from '../test/fixtures.ts'

describe('structured persona presentation', () => {
  it('puts a corroborated narrative name in the overview and replaces repeated names without changing source fields', () => {
    const named = { ...snapshot, fields: { ...fields,
      persona: 'Mary Alberti is a careful planner who values her routine.',
      professional_persona: 'Mary Alberti, a retail leader, mentors her colleagues.',
      sports_persona: 'Mary Alberti enjoys hiking.',
      arts_persona: 'Mary Alberti reads Mary Oliver and visits exhibitions.',
      cultural_background: 'Mary grew up in Wisconsin.',
      skills_and_expertise: "Mary’s skills include planning.",
    } }
    const persona = presentPersona(named)
    expect(persona.name).toBe('Mary Alberti')
    expect(persona.core).toBe('She is a careful planner who values her routine.')
    expect(persona.professional).toBe('She, a retail leader, mentors her colleagues.')
    expect(persona.interests.find(item => item.title === '艺术')?.text).toBe('She reads Mary Oliver and visits exhibitions.')
    expect(persona.details[0]?.text).toBe('She grew up in Wisconsin.')
    expect(persona.details[1]?.text).toBe('Her skills include planning.')
    const text = formatCharacterSheet(named)
    expect(text).toContain('Name: Mary Alberti')
    expect(text.match(/Mary Alberti/g)).toHaveLength(1)
    expect(text).toContain(persona.core)
    expect(text).toContain('Name extracted from matching narratives')
    expect(named.fields.persona).toBe('Mary Alberti is a careful planner who values her routine.')
    expect(text).not.toMatch(/this character/i)
  })

  it('keeps unknown or conflicting names unmodified instead of guessing', () => {
    expect(presentPersona(snapshot).name).toBeNull()
    const ambiguous = { ...snapshot, fields: { ...fields, persona: 'Mary Alberti is a planner.', professional_persona: 'Mary Alberti leads a team.', sports_persona: 'Jane Smith hikes.', arts_persona: 'Jane Smith paints.' } }
    expect(presentPersona(ambiguous).name).toBeNull()
    expect(presentPersona(ambiguous).core).toBe(ambiguous.fields.persona)
    expect(formatCharacterSheet(ambiguous)).toContain('Name: Not identified')
  })

  it('supports accents, apostrophes and surname particles and leaves unrelated names intact', () => {
    const named = { ...snapshot, fields: { ...fields, persona: 'Élodie de O’Neill is a painter.', professional_persona: 'Élodie de O’Neill paints murals.', cultural_background: 'Élodie Smith is her favorite artist.', career_goals_and_ambitions: 'A mentor helps Élodie de O’Neill grow.' } }
    expect(presentPersona(named).name).toBe('Élodie de O’Neill')
    expect(presentPersona(named).details[0]?.text).toBe('Élodie Smith is her favorite artist.')
    expect(presentPersona(named).details[3]?.text).toBe('A mentor helps them grow.')
  })

  it('recognizes a name corroborated inside another narrative, and repeated single-word names', () => {
    const named = { ...snapshot, fields: { ...fields, persona: 'Candra Vilus is a storyteller.', professional_persona: 'An aspiring entrepreneur, Candra Vilus blends communication with gardening.' } }
    expect(presentPersona(named).name).toBe('Candra Vilus')
    expect(presentPersona(named).professional).toBe('An aspiring entrepreneur, they blend communication with gardening.')
    const single = { ...snapshot, fields: { ...fields, persona: 'Emilea balances curiosity with planning.', professional_persona: 'Emilea volunteers.', sports_persona: 'Emilea enjoys soccer.' } }
    expect(presentPersona(single).name).toBe('Emilea')
    expect(presentPersona(single).core).toBe('They balance curiosity with planning.')
  })

  it('uses narrative pronouns rather than sex, with possessives and singular-they agreement', () => {
    const named = { ...snapshot, fields: { ...fields,
      persona: 'Aaron Riddick is a planner; they value quiet routines.',
      professional_persona: 'Aaron Riddick, a credit analyst, uses their experience.',
      sports_persona: 'Aaron Riddick watches games.', arts_persona: 'Aaron Riddick studies watercolor.',
      travel_persona: 'Aaron Riddick has a plan.', culinary_persona: 'Aaron Riddick enjoys cooking.',
      cultural_background: "Aaron's family lives nearby.",
    } }
    const persona = presentPersona(named)
    expect(persona.core).toBe('They are a planner; they value quiet routines.')
    expect(persona.professional).toBe('They, a credit analyst, use their experience.')
    expect(persona.interests.map(item => item.text)).toEqual(['They watch games.', 'They study watercolor.', 'They have a plan.', 'They enjoy cooking.'])
    expect(persona.details[0]?.text).toBe('Their family lives nearby.')
    const male = { ...named, fields: { ...named.fields, persona: 'Aaron Riddick enjoys his routine.', professional_persona: 'Aaron Riddick uses his experience.' } }
    expect(presentPersona(male).core).toBe('He enjoys his routine.')
    const conflict = { ...snapshot, fields: { ...fields, persona: 'Alex Smith enjoys his routine.', professional_persona: 'Alex Smith enjoys her routine.' } }
    expect(presentPersona(conflict).core).toBe('They enjoy his routine.')
    const mixed = { ...named, fields: { ...named.fields, hobbies_and_interests: 'He enjoys his garden.', career_goals_and_ambitions: 'He wants to expand his business.' } }
    expect(presentPersona(mixed).core).toBe('They are a planner; they value quiet routines.')
  })

  it('replaces in-sentence first-name references while retaining other people and agreeing after also', () => {
    const named = { ...snapshot, fields: { ...fields, persona: 'Mary Alberti is a planner; they value their routine.', professional_persona: 'Mary Alberti uses their experience.', hobbies_and_interests: 'Outside of work, Mary enjoys books by Mary Oliver. Mary also loves cooking.' } }
    expect(presentPersona(named).details.find(item => item.title === '兴趣爱好')?.text).toBe('Outside of work, they enjoy books by Mary Oliver. They also love cooking.')
    expect(named.fields.hobbies_and_interests).toBe('Outside of work, Mary enjoys books by Mary Oliver. Mary also loves cooking.')
  })

  it('retains the original nested-list encoding while exposing the string items and processing note', () => {
    const wrapped = { ...snapshot, fields: { ...snapshot.fields, skills_and_expertise_list: "[['Planning', 'Scheduling']]" }, lists: { ...snapshot.lists, skills: ['Planning', 'Scheduling'] } }
    expect(presentPersona(wrapped).warnings.join(' ')).toContain('skills_and_expertise_list')
    expect(formatCharacterSheet(wrapped)).toContain('Removed one outer list wrapper: skills_and_expertise_list')
    expect(wrapped.fields.skills_and_expertise_list).toBe("[['Planning', 'Scheduling']]")
  })

  it('shows all source fields including education and postal strings without inferring a name', () => {
    const persona = presentPersona(snapshot)
    expect(persona.overview.map(item => item.value)).toContain('00123')
    expect(persona.overview.map(item => item.value)).toContain('married_present')
    expect(persona.details.map(item => item.text)).toContain(fields.cultural_background)
    expect(persona.details.find(item => item.title === '技能列表')?.items).toEqual(snapshot.lists.skills)
    expect(persona.core).toBe(fields.persona)
  })
  it('formats the character sheet with unaltered narratives, normalized lists, missing values and attribution', () => {
    const text = formatCharacterSheet(snapshot)
    expect(text).toContain('# Character Profile\n\n## Overview')
    expect(text).toContain(fields.professional_persona)
    expect(text).toContain("**Skills List:**\n- Planning\n- Driver's scheduling")
    expect(text).toContain("Bachelor's field: Not provided")
    expect(text).toContain('Zipcode: 00123')
    expect(text).toContain(`UUID: ${fields.uuid}`)
    expect(text).toContain('NVIDIA — nvidia/Nemotron-Personas-USA, CC BY 4.0')
    expect(text).toContain('Changes: Reformatted from source fields.')
    expect(snapshot.fields.professional_persona).toBe(fields.professional_persona)
  })
  it('preserves age zero and flags it in both display and export instead of inventing an age', () => {
    const anomalous = { ...snapshot, fields: { ...fields, age: 0 } }
    expect(presentPersona(anomalous).warnings).toContain('年龄源字段需核查：0')
    expect(formatCharacterSheet(anomalous)).toContain('Age: 0')
    expect(formatCharacterSheet(anomalous)).toContain('Source field needs review: age=0')
  })
})
