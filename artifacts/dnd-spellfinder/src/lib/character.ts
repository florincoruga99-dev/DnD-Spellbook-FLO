import {
  CORE_CHARACTER_CLASSES,
  getClassProgression,
  type AbilityKey,
  type CastingMode,
} from '../data/class-spell-progressions';
import { schoolBase, type Spell } from './spells';

export type AbilityScores = Record<AbilityKey, number>;
export type SlotSource =
  | 'classe'
  | 'caratteristica'
  | 'dominio'
  | 'specializzazione'
  | 'aggiuntivo';

export type CharacterClassEntry = {
  id: string;
  name: string;
  level: number;
  knownSpellIds: string[];
  preparedSlots: Record<string, string>;
  usedSlots: Record<string, string>;
  manualBonusSlots: Record<string, number>;
  domainNames: string[];
  specializationSchool: string;
  oppositionSchools: string[];
};

export type CharacterSheet = {
  version: 1;
  name: string;
  abilities: AbilityScores;
  classes: CharacterClassEntry[];
};

export type DailySpellSlot = {
  id: string;
  spellLevel: number;
  source: SlotSource;
  canCast: boolean;
  abilityScoreRequired: number;
};

export type SpellLevelSummary = {
  spellLevel: number;
  base: number;
  abilityBonus: number;
  domainBonus: number;
  specialistBonus: number;
  manualBonus: number;
  total: number;
  slots: DailySpellSlot[];
};

export const CHARACTER_STORAGE_KEY = 'dnd35-character-sheet-v1';

export const DEFAULT_ABILITIES: AbilityScores = {
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
};

export function createEmptyCharacter(): CharacterSheet {
  return {
    version: 1,
    name: '',
    abilities: { ...DEFAULT_ABILITIES },
    classes: [],
  };
}

export function createClassEntry(
  name: string,
  id: string = globalThis.crypto.randomUUID(),
): CharacterClassEntry {
  if (!CORE_CHARACTER_CLASSES.includes(name as (typeof CORE_CHARACTER_CLASSES)[number])) {
    throw new Error(`Classe non supportata: ${name}`);
  }
  return {
    id,
    name,
    level: 1,
    knownSpellIds: [],
    preparedSlots: {},
    usedSlots: {},
    manualBonusSlots: {},
    domainNames: [],
    specializationSchool: '',
    oppositionSchools: [],
  };
}

export function getTotalCharacterLevel(character: CharacterSheet): number {
  return character.classes.reduce((total, entry) => total + entry.level, 0);
}

export function getCastingMode(className: string): CastingMode | null {
  return getClassProgression(className)?.mode ?? null;
}

export function getCastingAbility(className: string): AbilityKey | null {
  return getClassProgression(className)?.ability ?? null;
}

export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function getBonusSpellSlots(score: number, spellLevel: number): number {
  if (spellLevel <= 0) return 0;
  const modifier = getAbilityModifier(score);
  if (modifier < spellLevel) return 0;
  return Math.floor((modifier - spellLevel) / 4) + 1;
}

export function getRequiredOppositionSchoolCount(specializationSchool: string): number {
  return normalizeClassName(specializationSchool) === 'divinazione' ? 1 : 2;
}

export function getSpellIdentifier(spell: Spell): string {
  return spell.id ?? `${spell.name}::${spell.classLevels.map((entry) => `${entry.className}-${entry.level}`).sort().join('|')}`;
}

function normalizeClassName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('it')
    .replace(/[^a-z]/g, '');
}

function classNamesMatch(spellClassName: string, characterClassName: string): boolean {
  const characterName = normalizeClassName(characterClassName);
  const aliases = getClassProgression(characterClassName)?.catalogClassNames ?? [characterClassName];
  return aliases.some((alias) =>
    alias.split('/').some((part) => normalizeClassName(part) === characterName) ||
    normalizeClassName(alias) === characterName,
  ) || normalizeClassName(spellClassName) === characterName;
}

export function getSpellLevelForClass(spell: Spell, className: string): number | null {
  const classLevel = spell.classLevels.find((entry) => classNamesMatch(entry.className, className));
  if (classLevel) return classLevel.level;

  const listedForClass = spell.classes.some((entry) => classNamesMatch(entry, className));
  return listedForClass ? spell.level : null;
}

export function getClassSpellLevels(classEntry: CharacterClassEntry): number[] {
  const progression = getClassProgression(classEntry.name);
  if (!progression || classEntry.level < 1 || classEntry.level > 20) return [];
  const row = progression.slotRows[classEntry.level - 1] ?? [];
  return row.flatMap((slots, spellLevel) => (slots === null || slots === undefined ? [] : [spellLevel]));
}

export function getDailySpellSlots(
  classEntry: CharacterClassEntry,
  abilities: AbilityScores,
): DailySpellSlot[] {
  const progression = getClassProgression(classEntry.name);
  if (!progression || classEntry.level < 1 || classEntry.level > 20) return [];

  const row = progression.slotRows[classEntry.level - 1] ?? [];
  const abilityScore = abilities[progression.ability];
  const slots: DailySpellSlot[] = [];

  const addSlots = (spellLevel: number, source: SlotSource, count: number) => {
    for (let index = 0; index < count; index += 1) {
      slots.push({
        id: `${classEntry.id}:L${spellLevel}:${source}:${index}`,
        spellLevel,
        source,
        canCast: abilityScore >= 10 + spellLevel,
        abilityScoreRequired: 10 + spellLevel,
      });
    }
  };

  row.forEach((baseCount, spellLevel) => {
    if (baseCount === null || baseCount === undefined) return;

    addSlots(spellLevel, 'classe', baseCount);
    addSlots(
      spellLevel,
      'caratteristica',
      getBonusSpellSlots(abilityScore, spellLevel),
    );

    if (
      progression.extraSlotRule === 'cleric-domain' &&
      spellLevel > 0 &&
      classEntry.domainNames.filter(Boolean).length === 2
    ) {
      addSlots(spellLevel, 'dominio', 1);
    }

    if (
      progression.extraSlotRule === 'wizard-specialist' &&
      spellLevel > 0 &&
      classEntry.specializationSchool &&
      classEntry.oppositionSchools.filter(Boolean).length ===
        getRequiredOppositionSchoolCount(classEntry.specializationSchool) &&
      new Set(classEntry.oppositionSchools.filter(Boolean)).size ===
        getRequiredOppositionSchoolCount(classEntry.specializationSchool) &&
      !classEntry.oppositionSchools.includes(classEntry.specializationSchool)
    ) {
      addSlots(spellLevel, 'specializzazione', 1);
    }

    const manualBonus = Math.max(
      0,
      Math.floor(Number(classEntry.manualBonusSlots[String(spellLevel)] ?? 0)),
    );
    addSlots(spellLevel, 'aggiuntivo', manualBonus);
  });

  return slots;
}

export function getSpellLevelSummaries(
  classEntry: CharacterClassEntry,
  abilities: AbilityScores,
): SpellLevelSummary[] {
  const progression = getClassProgression(classEntry.name);
  const row = progression?.slotRows[classEntry.level - 1] ?? [];
  const levels = row.flatMap((count, spellLevel) =>
    count === null || count === undefined ? [] : [spellLevel],
  );
  const slots = getDailySpellSlots(classEntry, abilities);
  return levels.map((spellLevel) => {
    const atLevel = slots.filter((slot) => slot.spellLevel === spellLevel);
    return {
      spellLevel,
      base: atLevel.filter((slot) => slot.source === 'classe').length,
      abilityBonus: atLevel.filter((slot) => slot.source === 'caratteristica').length,
      domainBonus: atLevel.filter((slot) => slot.source === 'dominio').length,
      specialistBonus: atLevel.filter((slot) => slot.source === 'specializzazione').length,
      manualBonus: atLevel.filter((slot) => slot.source === 'aggiuntivo').length,
      total: atLevel.length,
      slots: atLevel,
    };
  });
}

export function canPrepareSpellInSlot(
  classEntry: CharacterClassEntry,
  abilities: AbilityScores,
  slot: DailySpellSlot,
  spell: Spell,
): boolean {
  if (getCastingMode(classEntry.name) !== 'prepared' || !slot.canCast) return false;

  const ability = getCastingAbility(classEntry.name);
  if (ability === null) return false;

  if (slot.source === 'dominio') {
    const domainLevel = spell.classLevels.find((entry) =>
      classEntry.domainNames.some(
        (domain) => normalizeClassName(domain) === normalizeClassName(entry.className),
      ),
    )?.level;
    if (
      domainLevel === undefined ||
      domainLevel !== slot.spellLevel ||
      abilities[ability] < 10 + domainLevel
    ) {
      return false;
    }
    return true;
  }

  const spellLevel = getSpellLevelForClass(spell, classEntry.name);
  if (spellLevel === null || spellLevel > slot.spellLevel) return false;
  if (abilities[ability] < 10 + spellLevel) return false;

  const normalizedSchool = normalizeClassName(schoolBase(spell.school));
  if (classEntry.name === 'Mago' && classEntry.specializationSchool) {
    const selectedOppositionSchools = classEntry.oppositionSchools.filter(Boolean);
    const requiredOppositionSchools = getRequiredOppositionSchoolCount(classEntry.specializationSchool);
    if (
      selectedOppositionSchools.length !== requiredOppositionSchools ||
      new Set(selectedOppositionSchools).size !== requiredOppositionSchools ||
      selectedOppositionSchools.includes(classEntry.specializationSchool)
    ) return false;
    if (
      selectedOppositionSchools.some(
        (school) => normalizeClassName(school) === normalizedSchool,
      )
    ) return false;
  }

  if (slot.source === 'specializzazione') {
    return (
      spellLevel === slot.spellLevel &&
      normalizeClassName(schoolBase(spell.school)) ===
        normalizeClassName(classEntry.specializationSchool)
    );
  }

  return true;
}

export function canCastKnownSpell(
  classEntry: CharacterClassEntry,
  abilities: AbilityScores,
  spell: Spell,
): boolean {
  if (getCastingMode(classEntry.name) !== 'spontaneous') return false;
  const spellLevel = getSpellLevelForClass(spell, classEntry.name);
  const ability = getCastingAbility(classEntry.name);
  if (spellLevel === null || ability === null) return false;
  if (!classEntry.knownSpellIds.includes(getSpellIdentifier(spell))) return false;
  if (abilities[ability] < 10 + spellLevel) return false;
  return getClassSpellLevels(classEntry).includes(spellLevel);
}

export function getSlotUsage(
  classEntry: CharacterClassEntry,
  slot: DailySpellSlot,
): { used: boolean; spellId: string | null } {
  const spellId = classEntry.usedSlots[slot.id];
  return { used: spellId !== undefined, spellId: spellId ?? null };
}

export function getOrphanedSlotState(
  classEntry: CharacterClassEntry,
  abilities: AbilityScores,
): string[] {
  const currentIds = new Set(
    getDailySpellSlots(classEntry, abilities).map((slot) => slot.id),
  );
  return [...new Set([
    ...Object.keys(classEntry.usedSlots),
    ...Object.keys(classEntry.preparedSlots),
  ])].filter((id) => !currentIds.has(id));
}

export function addClassToCharacter(
  character: CharacterSheet,
  className: string,
  id?: string,
): CharacterSheet {
  if (character.classes.some((entry) => entry.name === className)) {
    throw new Error(`${className} è già presente nella scheda.`);
  }
  return {
    ...character,
    classes: [...character.classes, createClassEntry(className, id)],
  };
}

export function updateClassLevel(
  character: CharacterSheet,
  classId: string,
  level: number,
): CharacterSheet {
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new Error('Il livello di classe deve essere compreso tra 1 e 20.');
  }
  return {
    ...character,
    classes: character.classes.map((entry) =>
      entry.id === classId ? { ...entry, level } : entry,
    ),
  };
}

export function removeClassFromCharacter(
  character: CharacterSheet,
  classId: string,
): CharacterSheet {
  return {
    ...character,
    classes: character.classes.filter((entry) => entry.id !== classId),
  };
}

export function resetDailyUses(character: CharacterSheet): CharacterSheet {
  return {
    ...character,
    classes: character.classes.map((entry) => ({ ...entry, usedSlots: {} })),
  };
}

export function addKnownSpell(
  character: CharacterSheet,
  classId: string,
  spell: Spell,
): CharacterSheet {
  const entry = character.classes.find((item) => item.id === classId);
  if (!entry || !getCastingMode(entry.name)) {
    throw new Error('La classe selezionata non ha un repertorio di incantesimi.');
  }
  const spellLevel = getSpellLevelForClass(spell, entry.name);
  const domainSpellLevel = entry.name === 'Chierico'
    ? spell.classLevels.find((classLevel) =>
        entry.domainNames.filter(Boolean).includes(classLevel.className),
      )?.level ?? null
    : null;
  if (
    (spellLevel === null || !getClassSpellLevels(entry).includes(spellLevel)) &&
    (domainSpellLevel === null || !getClassSpellLevels(entry).includes(domainSpellLevel))
  ) {
    throw new Error(`${spell.name} non è disponibile a questo livello da ${entry.name}.`);
  }
  const spellId = getSpellIdentifier(spell);
  if (entry.knownSpellIds.includes(spellId)) return character;

  return {
    ...character,
    classes: character.classes.map((item) =>
      item.id === classId
        ? { ...item, knownSpellIds: [...item.knownSpellIds, spellId] }
        : item,
    ),
  };
}

export function removeKnownSpell(
  character: CharacterSheet,
  classId: string,
  spellId: string,
): CharacterSheet {
  return {
    ...character,
    classes: character.classes.map((item) =>
      item.id === classId
        ? { ...item, knownSpellIds: item.knownSpellIds.filter((id) => id !== spellId) }
        : item,
    ),
  };
}

export function setPreparedSpell(
  character: CharacterSheet,
  classId: string,
  slotId: string,
  spell: Spell | null,
): CharacterSheet {
  const entry = character.classes.find((item) => item.id === classId);
  const slot = entry && getDailySpellSlots(entry, character.abilities).find((item) => item.id === slotId);
  if (!entry || !slot) throw new Error('Lo slot selezionato non è più disponibile.');
  if (entry.usedSlots[slotId]) throw new Error('Ripristina lo slot prima di cambiarne la preparazione.');
  if (spell && !canPrepareSpellInSlot(entry, character.abilities, slot, spell)) {
    throw new Error(`${spell.name} non è valido per questo slot.`);
  }

  const preparedSlots = { ...entry.preparedSlots };
  if (spell) preparedSlots[slotId] = getSpellIdentifier(spell);
  else delete preparedSlots[slotId];

  return {
    ...character,
    classes: character.classes.map((item) =>
      item.id === classId ? { ...item, preparedSlots } : item,
    ),
  };
}

export function recordPreparedCast(
  character: CharacterSheet,
  classId: string,
  slotId: string,
  spell: Spell,
): CharacterSheet {
  const entry = character.classes.find((item) => item.id === classId);
  const slot = entry && getDailySpellSlots(entry, character.abilities).find((item) => item.id === slotId);
  if (!entry || !slot || !slot.canCast) {
    throw new Error('Lo slot non è disponibile o la caratteristica è insufficiente.');
  }
  if (entry.usedSlots[slotId]) throw new Error('Questo slot è già stato usato.');
  if (entry.preparedSlots[slotId] !== getSpellIdentifier(spell)) {
    throw new Error('L’incantesimo non è quello preparato in questo slot.');
  }
  if (!canPrepareSpellInSlot(entry, character.abilities, slot, spell)) {
    throw new Error('L’incantesimo non può essere lanciato da questo slot.');
  }

  return {
    ...character,
    classes: character.classes.map((item) =>
      item.id === classId
        ? { ...item, usedSlots: { ...item.usedSlots, [slotId]: getSpellIdentifier(spell) } }
        : item,
    ),
  };
}

export function recordSpontaneousCast(
  character: CharacterSheet,
  classId: string,
  slotId: string,
  spell: Spell,
): CharacterSheet {
  const entry = character.classes.find((item) => item.id === classId);
  const slot = entry && getDailySpellSlots(entry, character.abilities).find((item) => item.id === slotId);
  if (!entry || !slot || !slot.canCast || !canCastKnownSpell(entry, character.abilities, spell)) {
    throw new Error('Incantesimo o slot non disponibile.');
  }
  if (slot.spellLevel !== getSpellLevelForClass(spell, entry.name)) {
    throw new Error('Per questo incantesimo serve uno slot del suo livello.');
  }
  if (entry.usedSlots[slotId]) throw new Error('Questo slot è già stato usato.');

  return {
    ...character,
    classes: character.classes.map((item) =>
      item.id === classId
        ? { ...item, usedSlots: { ...item.usedSlots, [slotId]: getSpellIdentifier(spell) } }
        : item,
    ),
  };
}

export function restoreDailySlot(
  character: CharacterSheet,
  classId: string,
  slotId: string,
): CharacterSheet {
  return {
    ...character,
    classes: character.classes.map((entry) => {
      if (entry.id !== classId) return entry;
      const usedSlots = { ...entry.usedSlots };
      delete usedSlots[slotId];
      return { ...entry, usedSlots };
    }),
  };
}

export function setManualBonusSlots(
  character: CharacterSheet,
  classId: string,
  spellLevel: number,
  count: number,
): CharacterSheet {
  if (!Number.isInteger(spellLevel) || spellLevel < 0 || spellLevel > 9) {
    throw new Error('Il livello dell’incantesimo non è valido.');
  }
  if (!Number.isInteger(count) || count < 0 || count > 99) {
    throw new Error('Il numero di slot aggiuntivi deve essere tra 0 e 99.');
  }
  return {
    ...character,
    classes: character.classes.map((entry) => {
      if (entry.id !== classId) return entry;
      const manualBonusSlots = { ...entry.manualBonusSlots };
      if (count === 0) delete manualBonusSlots[String(spellLevel)];
      else manualBonusSlots[String(spellLevel)] = count;
      return { ...entry, manualBonusSlots };
    }),
  };
}

export function parseCharacterSheet(value: unknown): CharacterSheet {
  if (!value || typeof value !== 'object') {
    throw new Error('La scheda salvata non è valida e non è stata sovrascritta.');
  }
  const candidate = value as Partial<CharacterSheet>;
  if (
    candidate.version !== 1 ||
    typeof candidate.name !== 'string' ||
    !candidate.abilities ||
    !Array.isArray(candidate.classes)
  ) {
    throw new Error('La versione della scheda salvata non è supportata.');
  }

  const abilities = candidate.abilities as AbilityScores;
  if (
    !['intelligence', 'wisdom', 'charisma'].every(
      (key) =>
        Number.isInteger(abilities[key as AbilityKey]) &&
        abilities[key as AbilityKey] >= 1 &&
        abilities[key as AbilityKey] <= 40,
    )
  ) {
    throw new Error('I punteggi di caratteristica salvati non sono validi.');
  }

  const classes = candidate.classes.map((entry) => {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      !CORE_CHARACTER_CLASSES.includes(entry.name as (typeof CORE_CHARACTER_CLASSES)[number]) ||
      !Number.isInteger(entry.level) ||
      entry.level < 1 ||
      entry.level > 20
    ) {
      throw new Error('Una classe della scheda salvata non è valida.');
    }
    return {
      id: entry.id,
      name: entry.name,
      level: entry.level,
      knownSpellIds: Array.isArray(entry.knownSpellIds) ? entry.knownSpellIds : [],
      preparedSlots: entry.preparedSlots && typeof entry.preparedSlots === 'object'
        ? entry.preparedSlots
        : {},
      usedSlots: entry.usedSlots && typeof entry.usedSlots === 'object'
        ? entry.usedSlots
        : {},
      manualBonusSlots: entry.manualBonusSlots && typeof entry.manualBonusSlots === 'object'
        ? entry.manualBonusSlots
        : {},
      domainNames: Array.isArray(entry.domainNames) ? entry.domainNames : [],
      specializationSchool: typeof entry.specializationSchool === 'string'
        ? entry.specializationSchool
        : '',
      oppositionSchools: Array.isArray(entry.oppositionSchools)
        ? entry.oppositionSchools
        : [],
    } satisfies CharacterClassEntry;
  });

  if (new Set(classes.map((entry) => entry.id)).size !== classes.length) {
    throw new Error('La scheda salvata contiene identificativi di classe duplicati.');
  }

  return {
    version: 1,
    name: candidate.name,
    abilities: { ...abilities },
    classes,
  };
}

export function loadCharacterSheet(): CharacterSheet | null {
  const stored = globalThis.localStorage.getItem(CHARACTER_STORAGE_KEY);
  if (!stored) return null;
  try {
    return parseCharacterSheet(JSON.parse(stored) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('La scheda salvata non è leggibile e non è stata sovrascritta.');
    }
    throw error;
  }
}

export function saveCharacterSheet(character: CharacterSheet): void {
  globalThis.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(character));
}
