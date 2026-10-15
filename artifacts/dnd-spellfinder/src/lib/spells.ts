import archive from '../data/archivio-dnd35-unito.json';

export type ClassLevel = {
  className: string;
  level: number;
};

type MaterialDetail = {
  label: string;
  value: string;
};

export type Spell = {
  id?: string;
  name: string;
  level: number | null;
  school: string;
  classes: string[];
  classLevels: ClassLevel[];
  castingTime: string;
  range: string;
  components: string;
  componentSource: string;
  materialDetails: MaterialDetail[];
  materialDetailRequiredButMissing: boolean;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  description: string;
  hasFullDescription: boolean;
  descriptionIsOcr: boolean;
  descriptionSource: string;
  aliases: string[];
  target: string;
  savingThrow: string;
  spellResistance: string;
  page: number | null;
  source: string;
  status: string;
};

type ArchiveClassLevel = {
  classe?: string;
  livello?: number;
  class?: string;
  level?: number;
};

type ArchiveSpell = {
  id?: string;
  nome?: string;
  classi_livelli?: ArchiveClassLevel[];
  scuola?: string | null;
  componenti?: string | null;
  fonte_componenti?: string | null;
  componenti_materiali?: string | null;
  componenti_materiali_arcani?: string | null;
  focus?: string | null;
  focus_arcano?: string | null;
  focus_mago?: string | null;
  focus_stregone?: string | null;
  focus_bardo?: string | null;
  focus_chierico?: string | null;
  focus_druido?: string | null;
  costo_pe?: string | null;
  tempo_lancio?: string | null;
  raggio?: string | null;
  bersaglio_area_effetto?: string | null;
  durata?: string | null;
  tiro_salvezza?: string | null;
  resistenza_incantesimi?: string | null;
  descrizione_breve?: string | null;
  descrizione_completa?: string | null;
  fonte_descrizione_completa?: string | null;
  nomi_alternativi?: string[] | string | null;
  pagina_descrizione_pdf?: number | null;
  fonte?: string | null;
  stato?: string | null;
};

type ArchiveFile = {
  incantesimi: ArchiveSpell[];
};

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function validLevel(value: unknown): number | null {
  if (value == null || text(value) === '') return null;
  const level = Number(value);
  return Number.isInteger(level) && level >= 0 && level <= 9 ? level : null;
}

function validPage(value: unknown): number | null {
  if (value == null || text(value) === '') return null;
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : null;
}

function splitClasses(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[;,|]/).map((item) => item.trim()).filter(Boolean);
}

function collectMaterialInfo(item: Record<string, unknown>, components: string): {
  details: MaterialDetail[];
  requiredButMissing: boolean;
} {
  const fields: Array<{ keys: string[]; label: string; type: 'material' | 'focus' | 'xp' }> = [
    { keys: ['componenti_materiali', 'materialComponents', 'material_components'], label: 'Componente materiale', type: 'material' },
    { keys: ['componenti_materiali_arcani', 'arcaneMaterialComponents', 'arcane_material_components'], label: 'Componente materiale arcano', type: 'material' },
    { keys: ['focus'], label: 'Focus', type: 'focus' },
    { keys: ['focus_arcano', 'arcaneFocus', 'arcane_focus'], label: 'Focus arcano', type: 'focus' },
    { keys: ['focus_mago', 'wizardFocus', 'wizard_focus'], label: 'Focus del mago', type: 'focus' },
    { keys: ['focus_stregone', 'sorcererFocus', 'sorcerer_focus'], label: 'Focus dello stregone', type: 'focus' },
    { keys: ['focus_bardo', 'bardFocus', 'bard_focus'], label: 'Focus del bardo', type: 'focus' },
    { keys: ['focus_chierico', 'clericFocus', 'cleric_focus'], label: 'Focus del chierico', type: 'focus' },
    { keys: ['focus_druido', 'druidFocus', 'druid_focus'], label: 'Focus del druido', type: 'focus' },
    { keys: ['costo_pe', 'xpCost', 'xp_cost'], label: 'Costo in PE', type: 'xp' },
  ];
  const byValue = new Map<string, { value: string; labels: string[] }>();
  const present = new Set<'material' | 'focus' | 'xp'>();

  for (const field of fields) {
    const value = field.keys.map((key) => text(item[key])).find(Boolean);
    if (!value) continue;
    present.add(field.type);
    const normalizedValue = value.toLocaleLowerCase('it').replace(/\s+/g, ' ').trim();
    const existing = byValue.get(normalizedValue);
    if (existing) {
      if (!existing.labels.includes(field.label)) existing.labels.push(field.label);
    } else {
      byValue.set(normalizedValue, { value, labels: [field.label] });
    }
  }

  const markers = new Set((components.match(/\b(?:M|F|DF|FD|XP)\b/gi) ?? []).map((marker) => marker.toUpperCase()));
  if ((markers.has('DF') || markers.has('FD')) && !present.has('focus')) {
    const alternativeCode = components.match(/\b([MF])\s*\/\s*DF\b/i)?.[1]?.toUpperCase();
    byValue.set('focus-divino-standard', {
      value: alternativeCode
        ? `La sigla ${alternativeCode}/DF ammette un focus divino in alternativa al componente ${alternativeCode}; il JSON non specifica un oggetto particolare.`
        : 'Focus divino indicato dalla sigla DF; il JSON non specifica un oggetto particolare.',
      labels: ['Focus divino (DF)'],
    });
  }

  const requiredButMissing =
    (markers.has('M') && !present.has('material')) ||
    (markers.has('F') && !present.has('focus')) ||
    (markers.has('XP') && !present.has('xp'));

  return {
    details: [...byValue.values()].map(({ value, labels }) => ({ label: labels.join(' / '), value })),
    requiredButMissing,
  };
}

function parseClassLevels(value: unknown, classesValue: unknown, fallbackLevel: unknown): ClassLevel[] {
  let entries: unknown = value;
  if (typeof entries === 'string' && entries.trim()) {
    try {
      entries = JSON.parse(entries);
    } catch {
      entries = [];
    }
  }

  if (Array.isArray(entries)) {
    const levels = entries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const record = entry as Record<string, unknown>;
      const className = text(record.classe ?? record.class);
      const level = validLevel(record.livello ?? record.level);
      return className && level !== null ? [{ className, level }] : [];
    });
    if (levels.length) return levels;
  }

  const level = validLevel(fallbackLevel);
  return level === null ? [] : splitClasses(classesValue).map((className) => ({ className, level }));
}

function normalizeSpell(item: Record<string, unknown>, index: number): Spell {
  const name = text(item.name ?? item.nome);
  const classLevels = parseClassLevels(
    item.classLevels ?? item.classi_livelli,
    item.classes ?? item.classi,
    item.level ?? item.livello,
  );
  const classes = [...new Set(classLevels.length
    ? classLevels.map((entry) => entry.className)
    : splitClasses(item.classes ?? item.classi))];
  const reportedLevel = validLevel(item.level ?? item.livello);
  const level = classLevels.length
    ? Math.min(...classLevels.map((entry) => entry.level))
    : reportedLevel;
  if (!name) throw new Error('Ogni incantesimo deve avere un nome.');

  const duration = text(item.duration ?? item.durata);
  const components = text(item.components ?? item.componenti);
  const materialInfo = collectMaterialInfo(item, components);
  const fullDescription = text(item.fullDescription ?? item.descrizione_completa);
  const descriptionSource = text(item.descriptionSource ?? item.fonte_descrizione_completa);
  const rawAliases = item.aliases ?? item.nomi_alternativi;
  const aliases = Array.isArray(rawAliases)
    ? rawAliases.map(text).filter(Boolean)
    : text(rawAliases).split(/[;,|]/).map((alias) => alias.trim()).filter(Boolean);
  return {
    id: text(item.id) || `${name}-${index}`,
    name,
    level,
    school: text(item.school ?? item.scuola) || 'Scuola non indicata',
    classes,
    classLevels,
    castingTime: text(item.castingTime ?? item.tempo_lancio),
    range: text(item.range ?? item.raggio),
    components,
    componentSource: text(item.componentSource ?? item.fonte_componenti),
    materialDetails: materialInfo.details,
    materialDetailRequiredButMissing: materialInfo.requiredButMissing,
    duration,
    concentration: /concentrazione/i.test(duration) || parseBoolean(item.concentration),
    ritual: parseBoolean(item.ritual),
    description: text(item.description) || fullDescription || text(item.descrizione_breve),
    hasFullDescription: Boolean(fullDescription),
    descriptionIsOcr: parseBoolean(item.descriptionIsOcr ?? item.descrizione_ocr) || /ocr/i.test(descriptionSource),
    descriptionSource,
    aliases,
    target: text(item.target ?? item.bersaglio_area_effetto),
    savingThrow: text(item.savingThrow ?? item.tiro_salvezza),
    spellResistance: text(item.spellResistance ?? item.resistenza_incantesimi),
    page: validPage(item.page ?? item.pagina_descrizione_pdf),
    source: text(item.source ?? item.fonte),
    status: text(item.status ?? item.stato),
  };
}

const archiveData = archive as ArchiveFile;

export const archiveSpells = archiveData.incantesimi.map((spell, index) =>
  normalizeSpell(spell as unknown as Record<string, unknown>, index),
);

export function schoolBase(school: string): string {
  return school.replace(/\s*[\[(].*$/, '').trim();
}

function parseBoolean(value: unknown): boolean {
  return value === true || String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'sì' || value === 1;
}

function parseCsv(text: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(value); if (row.some((cell) => cell.trim())) rows.push(row);
      row = []; value = '';
    } else value += char;
  }
  row.push(value); if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

export async function parseCatalogFile(file: File): Promise<Spell[]> {
  const text = await file.text();
  const parsed: unknown = file.name.toLowerCase().endsWith('.csv') ? parseCsv(text) : JSON.parse(text);
  const raw = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { incantesimi?: unknown }).incantesimi)
      ? (parsed as { incantesimi: unknown[] }).incantesimi
      : null;
  if (!raw) throw new Error('Il file JSON deve contenere un array o una proprietà "incantesimi".');
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error('Il catalogo contiene una voce non valida.');
    return normalizeSpell(item as Record<string, unknown>, index);
  });
}
