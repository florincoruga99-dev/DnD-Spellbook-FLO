import { useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, CircleHelp, CloudUpload, Command, Focus, FileJson2, ListFilter, Moon, Search, Sparkles, WandSparkles, X, Plus, Minus, RotateCcw, Trash2, UserRound, ShieldAlert, Check, Swords } from 'lucide-react';
import { Spell, archiveSpells, parseCatalogFile, schoolBase } from './lib/spells';
import { SpellDetail } from './components/SpellDetail';
import {
  CLERIC_DOMAIN_NAMES,
  CORE_CHARACTER_CLASSES,
  CORE_CHARACTER_RACES,
  WIZARD_SPECIALIZATION_SCHOOLS,
} from './data/class-spell-progressions';
import {
  addClassToCharacter, addKnownSpell, canCastKnownSpell, canPrepareSpellInSlot,
  CHARACTER_ABILITY_KEYS, createEmptyCharacter, getCastingAbilityForEntry,
  getCastingMode, getCastingModeForEntry, getDailySpellSlots, getSlotUsage,
  getSpellIdentifier, getSpellLevelForClass, getSpellLevelForEntry, getSpellLevelSummaries,
  getClassSpellLevels, getRequiredOppositionSchoolCount, getTotalCharacterLevel,
  isSpellcastingEntry,
  loadCharacterSheet, recordPreparedCast,
  recordSpontaneousCast, removeClassFromCharacter, resetDailyUses, restoreDailySlot,
  saveCharacterSheet, setAbilityScore, setCustomDailySlots, setCustomSpellcasting,
  setCustomSpellLevel, setManualBonusSlots, setPreparedSpell, updateClassLevel,
  type AbilityScores, type CharacterClassEntry, type CharacterSheet,
} from './lib/character';

const levels = ['Tutti i livelli', 'Trucchetto', ...Array.from({ length: 9 }, (_, i) => `Livello ${i + 1}`)];
const schoolShort: Record<string, string> = { Abiurazione: 'AB', Ammaliamento: 'AM', Divinazione: 'DI', Illusione: 'IL', Invocazione: 'IN', Necromanzia: 'NE', Trasmutazione: 'TR', Evocazione: 'EV' };
const abilityNames: Record<keyof AbilityScores, string> = {
  strength: 'Forza',
  dexterity: 'Destrezza',
  constitution: 'Costituzione',
  intelligence: 'Intelligenza',
  wisdom: 'Saggezza',
  charisma: 'Carisma',
};
const sourceNames: Record<string, string> = { classe: 'Classe', caratteristica: 'Caratteristica', dominio: 'Dominio', specializzazione: 'Specializzazione', aggiuntivo: 'Aggiuntivo' };
const spellKey = (spell: Spell) => getSpellIdentifier(spell);
const partyArtUrl = `${import.meta.env.BASE_URL}images/dnd35-adventuring-party.jpg`;

function getInitialCharacter(): { character: CharacterSheet; error: string } {
  try {
    return { character: loadCharacterSheet() ?? createEmptyCharacter(), error: '' };
  } catch (error) {
    return {
      character: createEmptyCharacter(),
      error: error instanceof Error ? error.message : 'La scheda salvata non è leggibile.',
    };
  }
}

function App() {
  const [spells, setSpells] = useState<Spell[]>(() => {
    try { const stored = localStorage.getItem('incantesimi-catalogo'); return stored ? JSON.parse(stored) as Spell[] : archiveSpells; }
    catch { return archiveSpells; }
  });
  const [personalCatalog, setPersonalCatalog] = useState(() => Boolean(localStorage.getItem('incantesimi-catalogo')));
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('Tutti i livelli');
  const [school, setSchool] = useState('Tutte le scuole');
  const [spellClass, setSpellClass] = useState('Tutte le classi');
  const [selected, setSelected] = useState<Spell | null>(archiveSpells[0]);
  const [importMessage, setImportMessage] = useState('');
  const [mobileDetail, setMobileDetail] = useState(false);
  const [view, setView] = useState<'archive' | 'character'>('archive');
  const [initialCharacter] = useState(getInitialCharacter);
  const [character, setCharacter] = useState<CharacterSheet>(initialCharacter.character);
  const [characterLoadError, setCharacterLoadError] = useState(initialCharacter.error);
  const [sheetMessage, setSheetMessage] = useState(initialCharacter.error);
  const [characterSearch, setCharacterSearch] = useState('');
  const [activeCharacterClass, setActiveCharacterClass] = useState('');
  const [characterSpellDetail, setCharacterSpellDetail] = useState<Spell | null>(null);
  const [spontaneousChoices, setSpontaneousChoices] = useState<Record<string, string>>({});
  const [abilityDrafts, setAbilityDrafts] = useState<Partial<Record<keyof AbilityScores, string>>>({});
  const [customSpellLevelDrafts, setCustomSpellLevelDrafts] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const schools = useMemo(() => [...new Set(spells.map((spell) => schoolBase(spell.school)).filter(Boolean))].sort(), [spells]);
  const classes = useMemo(() => [...new Set(spells.flatMap((spell) => spell.classes).filter(Boolean))].sort(), [spells]);
  const filtered = useMemo(() => spells.filter((spell) => {
    const text = `${spell.name} ${spell.aliases.join(' ')} ${spell.description} ${spell.school} ${spell.classes.join(' ')} ${spell.target} ${spell.savingThrow} ${spell.components} ${spell.materialDetails.map((detail) => `${detail.label} ${detail.value}`).join(' ')} ${spell.status}`.toLowerCase();
    const selectedLevel = level === 'Trucchetto' ? 0 : Number(level.replace('Livello ', ''));
    const hasLevel = spell.classLevels.length ? spell.classLevels.some((entry) => entry.level === selectedLevel) : spell.level === selectedLevel;
    return text.includes(query.toLowerCase()) && (level === 'Tutti i livelli' || hasLevel) && (school === 'Tutte le scuole' || schoolBase(spell.school) === school) && (spellClass === 'Tutte le classi' || spell.classes.includes(spellClass));
  }), [spells, query, level, school, spellClass]);
  const activeSelected = filtered.find((spell) => spell.id === selected?.id || spell.name === selected?.name) ?? filtered[0];

  const commitCharacter = (next: CharacterSheet) => {
    if (characterLoadError && !window.confirm(`${characterLoadError}\n\nSe continui, i dati salvati illeggibili saranno sostituiti dalla nuova scheda.`)) return;
    setCharacter(next);
    try {
      saveCharacterSheet(next);
      setCharacterLoadError('');
      setSheetMessage('Modifiche salvate su questo dispositivo.');
    }
    catch { setSheetMessage('Impossibile salvare la scheda in questo browser.'); }
  };
  const patchCharacter = (patch: Partial<CharacterSheet>) => commitCharacter({ ...character, ...patch });
  const updateEntry = (id: string, updater: (entry: CharacterClassEntry) => CharacterClassEntry) =>
    commitCharacter({ ...character, classes: character.classes.map((entry) => entry.id === id ? updater(entry) : entry) });
  const changeCustomSpellcasting = (
    entry: CharacterClassEntry,
    changes: Partial<CharacterClassEntry['customSpellcasting']>,
  ) => {
    try { commitCharacter(setCustomSpellcasting(character, entry.id, changes)); }
    catch (error) { setSheetMessage(error instanceof Error ? error.message : 'Impossibile modificare la magia personalizzata.'); }
  };
  const changeCustomDailySlots = (entry: CharacterClassEntry, spellLevel: number, count: number) => {
    try { commitCharacter(setCustomDailySlots(character, entry.id, spellLevel, count)); }
    catch (error) { setSheetMessage(error instanceof Error ? error.message : 'Impossibile aggiornare gli slot personalizzati.'); }
  };
  const changeCustomSpellLevel = (entry: CharacterClassEntry, spell: Spell, rawLevel: string) => {
    const draftKey = `${entry.id}:${spellKey(spell)}`;
    setCustomSpellLevelDrafts((current) => ({ ...current, [draftKey]: rawLevel }));
    if (rawLevel === '') return;
    const spellLevel = Number(rawLevel);
    if (!Number.isInteger(spellLevel) || spellLevel < 0 || spellLevel > 9) return;
    try { commitCharacter(setCustomSpellLevel(character, entry.id, spellKey(spell), spellLevel)); }
    catch (error) { setSheetMessage(error instanceof Error ? error.message : 'Impossibile assegnare il livello personalizzato.'); }
  };
  const clearCustomSpellLevelDraft = (draftKey: string) =>
    setCustomSpellLevelDrafts((current) => {
      const next = { ...current };
      delete next[draftKey];
      return next;
    });
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const result = await parseCatalogFile(file);
      if (!result.length) throw new Error('Il catalogo non contiene incantesimi validi.');
      setSpells(result); setPersonalCatalog(true); setSelected(result[0]); localStorage.setItem('incantesimi-catalogo', JSON.stringify(result));
      setImportMessage(`${result.length} incantesimi importati e salvati in questo browser.`);
    } catch (error) { setImportMessage(error instanceof Error ? error.message : 'Impossibile leggere il catalogo. Controlla il formato del file.'); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  };
  const resetCatalog = () => {
    localStorage.removeItem('incantesimi-catalogo'); setSpells(archiveSpells); setPersonalCatalog(false); setSelected(archiveSpells[0]); setImportMessage('Archivio D&D 3.5 ripristinato.');
  };
  const filtersActive = level !== 'Tutti i livelli' || school !== 'Tutte le scuole' || spellClass !== 'Tutte le classi' || query !== '';
  const clearFilters = () => { setQuery(''); setLevel('Tutti i livelli'); setSchool('Tutte le scuole'); setSpellClass('Tutte le classi'); };
  const addClass = (className: string) => {
    try {
      const next = addClassToCharacter(character, className);
      commitCharacter(next);
      setActiveCharacterClass(next.classes[next.classes.length - 1].id);
    } catch (error) { setSheetMessage(error instanceof Error ? error.message : 'Impossibile aggiungere la classe.'); }
  };
  const catalogForClass = (entry: CharacterClassEntry) => spells.filter((spell) =>
    (
      (entry.customSpellcasting.enabled && getCastingMode(entry.name) === null) ||
      getSpellLevelForClass(spell, entry.name) !== null ||
      (entry.name === 'Chierico' && spell.classLevels.some((classLevel) =>
        entry.domainNames.filter(Boolean).includes(classLevel.className),
      ))
    ) &&
    `${spell.name} ${spell.aliases.join(' ')} ${spell.school}`.toLocaleLowerCase('it').includes(characterSearch.toLocaleLowerCase('it')),
  );
  const addSpellToClass = (entry: CharacterClassEntry, spell: Spell) => {
    const identifier = spellKey(spell);
    if (entry.knownSpellIds.includes(identifier)) return;
    const isDomainSpell = entry.name === 'Chierico' && spell.classLevels.some((classLevel) =>
      entry.domainNames.filter(Boolean).includes(classLevel.className),
    );
    if (
      entry.customSpellcasting.enabled &&
      getCastingMode(entry.name) === null &&
      getSpellLevelForClass(spell, entry.name) === null &&
      !isDomainSpell &&
      entry.customSpellLevels[identifier] === undefined
    ) {
      setSheetMessage('Assegna prima il livello dell’incantesimo nella classe personalizzata.');
      return;
    }
    try { commitCharacter(addKnownSpell(character, entry.id, spell)); }
    catch (error) { setSheetMessage(error instanceof Error ? error.message : 'Impossibile aggiungere l’incantesimo.'); }
  };
  const getSpell = (id: string | undefined) => spells.find((spell) => spellKey(spell) === id);
  const spellLevelForEntry = (entry: CharacterClassEntry, spell: Spell) =>
    getSpellLevelForEntry(entry, spell) ??
    (entry.name === 'Chierico'
      ? spell.classLevels.find((classLevel) =>
          entry.domainNames.filter(Boolean).includes(classLevel.className),
        )?.level ?? null
      : null);
  const updatePreparedSpell = (entry: CharacterClassEntry, slotId: string, spellId: string) => {
    const spell = spellId ? getSpell(spellId) ?? null : null;
    try { commitCharacter(setPreparedSpell(character, entry.id, slotId, spell)); }
    catch (error) { setSheetMessage(error instanceof Error ? error.message : 'Impossibile modificare la preparazione.'); }
  };
  const castSpellFromSlot = (entry: CharacterClassEntry, slotId: string, spellId: string) => {
    const spell = getSpell(spellId);
    if (!spell) return;
    try {
      const next = getCastingModeForEntry(entry) === 'prepared'
        ? recordPreparedCast(character, entry.id, slotId, spell)
        : recordSpontaneousCast(character, entry.id, slotId, spell);
      commitCharacter(next);
    } catch (error) {
      setSheetMessage(error instanceof Error ? error.message : 'Impossibile registrare il lancio.');
    }
  };
  const updateDomain = (entry: CharacterClassEntry, index: number, value: string) =>
    updateEntry(entry.id, (current) => {
      const domainNames = [...current.domainNames];
      while (domainNames.length < 2) domainNames.push('');
      domainNames[index] = value;
      if (value && domainNames[1 - index] === value) domainNames[1 - index] = '';
      return { ...current, domainNames };
    });
  const updateSpecialization = (entry: CharacterClassEntry, value: string) =>
    updateEntry(entry.id, (current) => ({
      ...current,
      specializationSchool: value,
      oppositionSchools: value === current.specializationSchool ? current.oppositionSchools : [],
    }));
  const updateOppositionSchool = (entry: CharacterClassEntry, index: number, value: string) =>
    updateEntry(entry.id, (current) => {
      const oppositionSchools = [...current.oppositionSchools];
      while (oppositionSchools.length < 2) oppositionSchools.push('');
      oppositionSchools[index] = value;
      if (value && oppositionSchools[1 - index] === value) oppositionSchools[1 - index] = '';
      return { ...current, oppositionSchools };
    });
  const orphanAssignments = (entry: CharacterClassEntry) => {
    const slots = getDailySpellSlots(entry, character.abilities);
    const slotById = new Map(slots.map((slot) => [slot.id, slot]));
    const stale = new Set<string>();
    Object.entries(entry.preparedSlots).forEach(([id, spellId]) => {
      const slot = slotById.get(id);
      const spell = getSpell(spellId);
      if (!slot || !spell || !canPrepareSpellInSlot(entry, character.abilities, slot, spell)) stale.add(id);
    });
    Object.entries(entry.usedSlots).forEach(([id, spellId]) => {
      const slot = slotById.get(id);
      const spell = getSpell(spellId);
      if (!slot || !spell || (getCastingMode(entry.name) === 'prepared'
        ? !canPrepareSpellInSlot(entry, character.abilities, slot, spell)
        : !canCastKnownSpell(entry, character.abilities, spell))) stale.add(id);
    });
    return [...stale];
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><WandSparkles size={19} strokeWidth={1.8} /></div><div><div className="brand-name">Incantesimi</div><div className="brand-sub">TACCUINO DELL’ARCANO</div></div></div>
        <div className="topbar-right">
          <span className="catalog-status"><span className="status-dot" />{personalCatalog ? 'Catalogo personale' : 'Archivio D&D 3.5'}</span>
          <button className="import-button" onClick={() => fileRef.current?.click()} aria-label="Importa catalogo" data-testid="button-import"><CloudUpload size={16} /><span>Importa catalogo</span></button>
          <input ref={fileRef} type="file" accept=".json,.csv,application/json,text/csv" hidden onChange={(e) => void importFile(e.target.files?.[0])} data-testid="input-import-file" />
        </div>
      </header>

      <nav className="view-tabs" aria-label="Sezioni del taccuino" data-testid="navigation-views">
        <button className={view === 'archive' ? 'view-tab active' : 'view-tab'} aria-pressed={view === 'archive'} onClick={() => setView('archive')} data-testid="tab-archive"><BookOpen size={15} /> Archivio incantesimi</button>
        <button className={view === 'character' ? 'view-tab active' : 'view-tab'} aria-pressed={view === 'character'} onClick={() => setView('character')} data-testid="tab-character"><UserRound size={15} /> Scheda del personaggio</button>
      </nav>

      {view === 'archive' ? <>
        <section className="hero">
          <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line" /> ARCHIVIO D&D 3.5, A PORTATA DI MANO</div><h1>La magia giusta,<br /><em>al momento giusto.</em></h1><p>Cerca tra gli incantesimi del tuo manuale. Filtra, consulta i dettagli e torna alla partita.</p></div>
          <div className="hero-glyph" aria-hidden="true"><div className="glyph-ring ring-outer" /><div className="glyph-ring ring-inner" /><div className="glyph-star"><Sparkles size={32} strokeWidth={1} /></div><i className="glyph-orbit orbit-a" /><i className="glyph-orbit orbit-b" /><span className="glyph-label">ARCHIVIO<br />ARCANO</span></div>
          <div className="hero-foot"><span><BookOpen size={14} /> {spells.length} incantesimi nel grimorio</span><span className="hero-foot-right">EDIZIONE DEL VIANDANTE <span className="tiny-diamond">✦</span></span></div>
        </section>
        <section className="finder">
          <aside className="filter-panel">
            <div className="panel-heading"><div className="panel-title"><ListFilter size={16} /> Filtra incantesimi</div><span className="filter-count">{filtered.length}</span></div>
            <label className="field-label" htmlFor="level-filter">LIVELLO</label><div className="select-wrap"><select id="level-filter" value={level} onChange={(e) => setLevel(e.target.value)} data-testid="select-level">{levels.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></div>
            <label className="field-label" htmlFor="class-filter">CLASSE</label><div className="select-wrap"><select id="class-filter" value={spellClass} onChange={(e) => setSpellClass(e.target.value)} data-testid="select-class"><option>Tutte le classi</option>{classes.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></div>
            <label className="field-label" htmlFor="school-filter">SCUOLA DI MAGIA</label><div className="select-wrap"><select id="school-filter" value={school} onChange={(e) => setSchool(e.target.value)} data-testid="select-school"><option>Tutte le scuole</option>{schools.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></div>
            <div className="filter-separator" /><div className="filter-note"><CircleHelp size={15} /><span>I filtri si combinano tra loro. Affina la ricerca per trovare ciò che ti serve.</span></div>
            {filtersActive && <button className="clear-filters" onClick={clearFilters} data-testid="button-clear-filters"><X size={14} /> Azzera filtri</button>}
            <div className="import-hint"><FileJson2 size={15} /><span>Importa un tuo archivio <b>JSON</b> o <b>CSV</b>. Il catalogo viene salvato nel browser.</span></div>
            {importMessage && <div className={importMessage.startsWith('Impossibile') || importMessage.startsWith('Il catalogo') ? 'import-message error' : 'import-message'} role="status" data-testid="status-catalog-import">{importMessage}</div>}
            {personalCatalog && <button className="restore-button" onClick={resetCatalog} data-testid="button-reset-catalog">Ripristina archivio D&D 3.5</button>}
          </aside>
          <section className={`results-panel ${mobileDetail ? 'show-detail' : ''}`} aria-label="Risultati degli incantesimi">
            <div className="results-toolbar"><div className="results-title-wrap"><div className="results-title">{mobileDetail ? 'Scheda incantesimo' : 'Grimorio'}</div><span className="results-subtitle">{filtered.length} {filtered.length === 1 ? 'risultato' : 'risultati'}</span></div><div className="search-box"><Search size={16} /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca incantesimi..." aria-label="Cerca incantesimi" data-testid="input-search" /><kbd><Command size={11} /> K</kbd></div></div>
            {filtered.length ? <div className="spell-layout"><div className="spell-list">{filtered.map((spell, index) => <button key={`${spell.name}-${spell.level}-${index}`} className={`spell-row ${activeSelected?.name === spell.name ? 'selected' : ''}`} onClick={() => { setSelected(spell); setMobileDetail(true); }} data-testid={`spell-${spell.name.toLowerCase().replace(/\s+/g, '-')}`}>
              <span className={`school-sigil sigil-${schoolShort[schoolBase(spell.school)]?.toLowerCase() ?? 'ev'}`}>{schoolShort[schoolBase(spell.school)] ?? 'MA'}</span><span className="spell-row-info"><span className="spell-name">{spell.name}</span><span className="spell-meta">{spell.school} <span>·</span> {spell.level === null ? 'Livello non indicato' : `Livello ${spell.level}`}</span></span><span className="spell-row-traits">{spell.ritual && <span className="trait-icon" title="Rituale"><Moon size={14} /></span>}{spell.concentration && <span className="trait-icon" title="Concentrazione"><Focus size={14} /></span>}</span>
            </button>)}</div>{activeSelected && <SpellDetail spell={activeSelected} onBack={() => setMobileDetail(false)} />}</div> : <div className="empty-state"><div className="empty-icon"><Search size={22} /></div><h3>Nessuna magia trovata</h3><p>Prova a modificare la ricerca o allenta uno dei filtri.</p><button onClick={clearFilters} data-testid="button-empty-reset">Azzera filtri</button></div>}
            <div className="list-footer"><span><span className="footer-dot" /> I dati restano sul tuo dispositivo</span><span className="footer-key"><span>INCANTESIMI</span><span className="footer-divider" /> {filtered.length} / {spells.length}</span></div>
          </section>
        </section>
      </> : <section className="character-page">
        <div className="character-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> SCHEDA PERSONAGGIO · D&D 3.5</div><h1>La tua magia,<br /><em>pronta per la partita.</em></h1><p>Risorse e incantesimi distinti per ogni classe, salvati in locale.</p></div><div className="character-art"><img src={partyArtUrl} alt="Illustrazione originale di un gruppo fantasy con razze e classi diverse." loading="lazy" /></div><div className="character-total"><span>LIVELLO TOTALE</span><strong data-testid="text-total-level">{getTotalCharacterLevel(character)}</strong><small>{character.classes.length} {character.classes.length === 1 ? 'classe' : 'classi'}</small></div></div>
        {sheetMessage && <p className={characterLoadError ? 'sheet-save-message error' : 'sheet-save-message'} role={characterLoadError ? 'alert' : 'status'} data-testid="status-character-save">{sheetMessage}</p>}
        <div className="sheet-layout">
          <aside className="sheet-sidebar">
            <section className="sheet-card identity-card"><div className="sheet-section-heading"><span className="section-index">01</span><div><h2>Identità</h2><p>Una scheda, un personaggio.</p></div></div>
              <label className="sheet-label" htmlFor="character-name">NOME DEL PERSONAGGIO</label><input id="character-name" className="sheet-input" value={character.name} onChange={(e) => patchCharacter({ name: e.target.value })} placeholder="Es. Livia delle Selve" data-testid="input-character-name" />
              <label className="sheet-label" htmlFor="character-race">RAZZA</label><input id="character-race" className="sheet-input" list="dnd35-races" value={character.race} onChange={(e) => patchCharacter({ race: e.target.value })} placeholder="Scegli o scrivi una razza" data-testid="input-character-race" /><datalist id="dnd35-races">{CORE_CHARACTER_RACES.map((race) => <option key={race} value={race} />)}</datalist>
              <div className="ability-title"><span>CARATTERISTICHE</span><span>01—40</span></div>
              <div className="ability-grid">{CHARACTER_ABILITY_KEYS.map((ability) => <label className="ability-field" key={ability}><span>{abilityNames[ability]}</span><input aria-label={abilityNames[ability]} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} value={abilityDrafts[ability] ?? String(character.abilities[ability])} onFocus={(event) => event.currentTarget.select()} onChange={(event) => {
                const raw = event.currentTarget.value.replace(/\D/g, '').slice(0, 2);
                setAbilityDrafts((current) => ({ ...current, [ability]: raw }));
                const score = Number(raw);
                if (raw !== '' && Number.isInteger(score) && score >= 1 && score <= 40) {
                  try { commitCharacter(setAbilityScore(character, ability, score)); }
                  catch (error) { setSheetMessage(error instanceof Error ? error.message : 'Impossibile aggiornare la caratteristica.'); }
                }
              }} onBlur={() => {
                const raw = abilityDrafts[ability];
                if (raw !== undefined) {
                  const score = Number(raw);
                  if (raw !== '' && Number.isInteger(score) && score >= 1 && score <= 40) {
                    if (score !== character.abilities[ability]) {
                      try { commitCharacter(setAbilityScore(character, ability, score)); }
                      catch (error) { setSheetMessage(error instanceof Error ? error.message : 'Impossibile aggiornare la caratteristica.'); }
                    }
                  }
                  setAbilityDrafts((current) => {
                    const next = { ...current };
                    delete next[ability];
                    return next;
                  });
                }
              }} data-testid={`input-ability-${ability}`} /></label>)}</div>
              <p className="local-note"><ShieldAlert size={14} /> La scheda resta salvata solo su questo browser e dispositivo.</p>
            </section>
            <section className="sheet-card class-manager"><div className="sheet-section-heading"><span className="section-index">02</span><div><h2>Classi</h2><p>Livelli del personaggio.</p></div></div>
              <label className="sheet-label" htmlFor="add-class-select">AGGIUNGI UNA CLASSE</label><div className="add-class-row"><select id="add-class-select" defaultValue="" data-testid="select-add-class"><option value="" disabled>Scegli una classe…</option>{CORE_CHARACTER_CLASSES.filter((name) => !character.classes.some((entry) => entry.name === name)).map((name) => <option key={name}>{name}</option>)}</select><button aria-label="Aggiungi classe" data-testid="button-add-class" onClick={() => { const select = document.getElementById('add-class-select') as HTMLSelectElement | null; if (select?.value) { addClass(select.value); select.value = ''; } }}><Plus size={16} /></button></div>
              {character.classes.length === 0 ? <div className="class-empty"><span><Swords size={18} /></span><b>Nessuna classe aggiunta</b><small>Scegli una classe per costruire la scheda.</small></div> : <div className="class-summary-list">{character.classes.map((entry) => {
                const classMode = getCastingModeForEntry(entry);
                return <div className={`class-summary ${activeCharacterClass === entry.id ? 'chosen' : ''}`} key={entry.id}>
                  <button className="class-summary-name" onClick={() => setActiveCharacterClass(entry.id)} data-testid={`button-select-class-${entry.id}`}><span className="class-monogram">{entry.name.slice(0, 1)}</span><span><b>{entry.name}</b><small>{classMode ? (classMode === 'prepared' ? 'Incantatore · prepara' : 'Incantatore · spontaneo') : 'Nessun incantesimo di classe'}</small></span></button>
                  <label className="level-stepper"><span>Liv.</span><button aria-label={`Riduci livello ${entry.name}`} onClick={() => { if (entry.level > 1) commitCharacter(updateClassLevel(character, entry.id, entry.level - 1)); }} data-testid={`button-level-down-${entry.id}`}><Minus size={12} /></button><input aria-label={`Livello ${entry.name}`} type="number" min="1" max="20" value={entry.level} onChange={(e) => { const value = Number(e.target.value); if (Number.isInteger(value) && value >= 1 && value <= 20) commitCharacter(updateClassLevel(character, entry.id, value)); }} data-testid={`input-class-level-${entry.id}`} /><button aria-label={`Aumenta livello ${entry.name}`} onClick={() => { if (entry.level < 20) commitCharacter(updateClassLevel(character, entry.id, entry.level + 1)); }} data-testid={`button-level-up-${entry.id}`}><Plus size={12} /></button></label>
                  <button className="remove-class" aria-label={`Rimuovi ${entry.name}`} title={`Rimuovi ${entry.name}`} onClick={() => { if (window.confirm(`Rimuovere ${entry.name} dalla scheda? Gli incantesimi e gli slot associati saranno rimossi.`)) { const next = removeClassFromCharacter(character, entry.id); commitCharacter(next); if (activeCharacterClass === entry.id) setActiveCharacterClass(next.classes[0]?.id ?? ''); } }} data-testid={`button-remove-class-${entry.id}`}><Trash2 size={14} /></button>
                  {!getCastingMode(entry.name) && <button className="custom-magic-toggle" aria-pressed={entry.customSpellcasting.enabled} onClick={() => changeCustomSpellcasting(entry, { enabled: !entry.customSpellcasting.enabled })} data-testid={`button-custom-magic-${entry.id}`}>{entry.customSpellcasting.enabled ? 'Disattiva magia personalizzata' : 'Configura magia personalizzata'}</button>}
                </div>;
              })}</div>}
            </section>
          </aside>
          <div className="class-resources">
            {character.classes.filter(isSpellcastingEntry).length === 0 ? <section className="resource-empty"><div className="empty-icon"><WandSparkles size={22} /></div><h2>La pagina degli incantesimi è vuota</h2><p>Aggiungi una classe incantatrice o configura la magia personalizzata per visualizzare preparazione e usi giornalieri.</p></section> : character.classes.filter(isSpellcastingEntry).map((entry) => {
              const mode = getCastingModeForEntry(entry)!;
              const ability = getCastingAbilityForEntry(entry)!;
              const summaries = getSpellLevelSummaries(entry, character.abilities);
              const knownSpells = entry.knownSpellIds.map((id) => getSpell(id)).filter((spell): spell is Spell => Boolean(spell));
              const classSpells = catalogForClass(entry);
              const orphans = orphanAssignments(entry);
              return <section className={`resource-card ${activeCharacterClass === entry.id ? 'resource-active' : ''}`} key={entry.id} data-testid={`section-resources-${entry.id}`}>
                <div className="resource-head"><div className="resource-title"><span className="resource-symbol"><WandSparkles size={17} /></span><div><span className="resource-kicker">{entry.customSpellcasting.enabled && !getCastingMode(entry.name) ? 'MAGIA PERSONALIZZATA' : mode === 'prepared' ? 'PREPARAZIONE GIORNALIERA' : 'INCANTATORE SPONTANEO'}</span><h2>{entry.name} <small>livello {entry.level}</small></h2></div></div><button className="reset-day" onClick={() => { if (window.confirm('Ripristinare gli slot usati di tutte le classi? Le preparazioni resteranno invariate.')) { commitCharacter(resetDailyUses(character)); } }} data-testid={`button-reset-daily-${entry.id}`}><RotateCcw size={14} /> Ripristina tutti gli slot</button></div>
                <div className="resource-meta"><span><b>Caratteristica</b>{abilityNames[ability]} · {character.abilities[ability]} ({Math.floor((character.abilities[ability] - 10) / 2) >= 0 ? '+' : ''}{Math.floor((character.abilities[ability] - 10) / 2)})</span><span><b>Metodo</b>{mode === 'prepared' ? 'Incantesimi preparati' : 'Incantesimi conosciuti'}</span><span><b>Repertorio</b>{knownSpells.length} {knownSpells.length === 1 ? 'incantesimo' : 'incantesimi'}</span></div>
                {entry.customSpellcasting.enabled && !getCastingMode(entry.name) && (
                  <section className="custom-magic-settings" aria-label={`Impostazioni magia personalizzata per ${entry.name}`}>
                    <div className="custom-magic-heading"><div><h3>Magia personalizzata</h3><p>Nessuna progressione standard applicata: imposta qui le regole della campagna.</p></div></div>
                    <div className="custom-magic-controls">
                      <label><span>Metodo</span><select value={entry.customSpellcasting.mode} onChange={(event) => changeCustomSpellcasting(entry, { mode: event.target.value as 'prepared' | 'spontaneous' })} aria-label={`Metodo di lancio per ${entry.name}`}><option value="prepared">Incantesimi preparati</option><option value="spontaneous">Incantesimi spontanei</option></select></label>
                      <label><span>Caratteristica chiave</span><select value={entry.customSpellcasting.ability} onChange={(event) => changeCustomSpellcasting(entry, { ability: event.target.value as keyof AbilityScores })} aria-label={`Caratteristica magica per ${entry.name}`}>{CHARACTER_ABILITY_KEYS.map((key) => <option key={key} value={key}>{abilityNames[key]}</option>)}</select></label>
                      <label><span>Livello massimo</span><select value={entry.customSpellcasting.maxSpellLevel} onChange={(event) => changeCustomSpellcasting(entry, { maxSpellLevel: Number(event.target.value) })} aria-label={`Livello massimo degli incantesimi per ${entry.name}`}>{Array.from({ length: 10 }, (_, spellLevel) => <option key={spellLevel} value={spellLevel}>{spellLevel === 0 ? '0 · Trucchetti' : `${spellLevel}° livello`}</option>)}</select></label>
                      <label className="custom-bonus-toggle"><input type="checkbox" checked={entry.customSpellcasting.useAbilityBonusSlots} onChange={(event) => changeCustomSpellcasting(entry, { useAbilityBonusSlots: event.target.checked })} /><span>Aggiungi slot bonus dalla caratteristica</span></label>
                    </div>
                    <div className="custom-daily-slots"><b>Slot giornalieri manuali</b><div>{Array.from({ length: entry.customSpellcasting.maxSpellLevel + 1 }, (_, spellLevel) => <label key={spellLevel}><span>{spellLevel === 0 ? 'Trucchetti' : `${spellLevel}° livello`}</span><input type="number" min="0" max="99" value={entry.customSpellcasting.dailySlots[String(spellLevel)] ?? 0} onChange={(event) => changeCustomDailySlots(entry, spellLevel, Math.max(0, Math.min(99, Number(event.target.value) || 0)))} aria-label={`Slot giornalieri personalizzati di ${spellLevel}° livello per ${entry.name}`} data-testid={`input-custom-slots-${entry.id}-${spellLevel}`} /></label>)}</div></div>
                  </section>
                )}
                <div className="class-rule-options">
                  {entry.name === 'Chierico' && (
                    <details className="class-rule-details">
                      <summary>Domini clericali</summary>
                      <p>Scegli i due domini del personaggio per attivare gli slot di dominio, distinti per livello.</p>
                      <div className="rule-select-grid">
                        {[0, 1].map((index) => (
                          <label key={index}>
                            <span>Dominio {index + 1}</span>
                            <select
                              value={entry.domainNames[index] ?? ''}
                              onChange={(event) => updateDomain(entry, index, event.target.value)}
                              aria-label={`Dominio clericale ${index + 1}`}
                              data-testid={`select-domain-${entry.id}-${index + 1}`}
                            >
                              <option value="">Non selezionato</option>
                              {CLERIC_DOMAIN_NAMES.filter((domain) =>
                                domain === entry.domainNames[index] || !entry.domainNames.includes(domain),
                              ).map((domain) => <option key={domain} value={domain}>{domain}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                    </details>
                  )}
                  {entry.name === 'Mago' && (
                    <details className="class-rule-details">
                      <summary>Specializzazione del mago</summary>
                      <label className="rule-full-field">
                        <span>Scuola specialistica</span>
                        <select
                          value={entry.specializationSchool}
                          onChange={(event) => updateSpecialization(entry, event.target.value)}
                          aria-label="Scuola di specializzazione del mago"
                          data-testid={`select-specialization-${entry.id}`}
                        >
                          <option value="">Nessuna specializzazione</option>
                          {WIZARD_SPECIALIZATION_SCHOOLS.map((school) => <option key={school} value={school}>{school}</option>)}
                        </select>
                      </label>
                      {entry.specializationSchool && (
                        <>
                          <p>Per Divinazione serve una scuola proibita; per le altre specializzazioni ne servono due. Gli slot specialistici si attivano quando la scelta è completa.</p>
                          <div className="rule-select-grid">
                            {Array.from(
                              { length: getRequiredOppositionSchoolCount(entry.specializationSchool) },
                              (_, index) => {
                                const otherSchool = entry.oppositionSchools[1 - index];
                                const selectedSchool = entry.oppositionSchools[index] ?? '';
                                return (
                                  <label key={index}>
                                    <span>Scuola proibita {index + 1}</span>
                                    <select
                                      value={selectedSchool}
                                      onChange={(event) => updateOppositionSchool(entry, index, event.target.value)}
                                      aria-label={`Scuola proibita ${index + 1}`}
                                      data-testid={`select-opposition-${entry.id}-${index + 1}`}
                                    >
                                      <option value="">Non selezionata</option>
                                      {WIZARD_SPECIALIZATION_SCHOOLS
                                        .filter((school) => school !== entry.specializationSchool && (school !== otherSchool || school === selectedSchool))
                                        .map((school) => <option key={school} value={school}>{school}</option>)}
                                    </select>
                                  </label>
                                );
                              },
                            )}
                          </div>
                        </>
                      )}
                    </details>
                  )}
                  <details className="class-rule-details">
                    <summary>Slot aggiuntivi manuali</summary>
                    <p>Usali per talenti o capacità personali non inclusi nella progressione automatica.</p>
                    <div className="manual-slot-grid">
                      {getClassSpellLevels(entry).map((spellLevel) => (
                        <label key={spellLevel}>
                          <span>{spellLevel === 0 ? 'Trucchetti' : `${spellLevel}° livello`}</span>
                          <input
                            type="number"
                            min="0"
                            max="99"
                            value={entry.manualBonusSlots[String(spellLevel)] ?? 0}
                            aria-label={`Slot aggiuntivi di livello ${spellLevel}`}
                            onChange={(event) => {
                              const count = Math.max(0, Math.min(99, Number(event.target.value) || 0));
                              try {
                                commitCharacter(setManualBonusSlots(character, entry.id, spellLevel, count));
                              } catch (error) {
                                setSheetMessage(error instanceof Error ? error.message : 'Impossibile aggiornare gli slot.');
                              }
                            }}
                            data-testid={`input-manual-slots-${entry.id}-${spellLevel}`}
                          />
                        </label>
                      ))}
                    </div>
                  </details>
                </div>
                {orphans.length > 0 && <div className="orphan-warning" role="status" data-testid={`status-orphan-slots-${entry.id}`}><ShieldAlert size={17} /><span><b>Assegnazioni non disponibili</b>{orphans.length} assegnazioni salvate non corrispondono agli slot o ai requisiti attuali. Restano conservate: rivedi il livello, la caratteristica e il repertorio prima di modificarle.</span></div>}
                <div className="slots-heading"><div><h3>Slot giornalieri</h3><p>{entry.customSpellcasting.enabled && !getCastingMode(entry.name) ? 'Gli slot di questa classe sono definiti manualmente e restano distinti da quelli delle altre classi.' : 'Le progressioni seguono le regole della classe. Le assegnazioni restano salvate anche se non più accessibili.'}</p></div></div>
                {summaries.length ? <div className="slot-level-list">{summaries.map((summary) => <div className="slot-level" key={summary.spellLevel} data-testid={`slot-level-${entry.id}-${summary.spellLevel}`}><div className="slot-level-label"><b>{summary.spellLevel === 0 ? 'Trucchetti' : `${summary.spellLevel}° livello`}</b><span>{summary.total} slot</span><small className="slot-count-summary">{summary.slots.filter((slot) => entry.usedSlots[slot.id]).length} usati · {summary.slots.filter((slot) => slot.canCast && !entry.usedSlots[slot.id]).length} disponibili{summary.slots.some((slot) => !slot.canCast) ? ` · ${summary.slots.filter((slot) => !slot.canCast).length} non utilizzabili` : ''}</small><small>{summary.base} classe{summary.abilityBonus ? ` · ${summary.abilityBonus} caratteristica` : ''}{summary.domainBonus ? ` · ${summary.domainBonus} dominio` : ''}{summary.specialistBonus ? ` · ${summary.specialistBonus} specializzazione` : ''}{summary.manualBonus ? ` · ${summary.manualBonus} aggiuntivi` : ''}</small></div>
                    <div className="slot-list">{summary.slots.map((slot) => {
                      const usage = getSlotUsage(entry, slot);
                      const preparedId = entry.preparedSlots[slot.id];
                      const preparedSpell = getSpell(preparedId);
                      const canPrepare = spells.filter((spell) =>
                        (entry.name !== 'Mago' || entry.knownSpellIds.includes(spellKey(spell))) &&
                        canPrepareSpellInSlot(entry, character.abilities, slot, spell),
                      );
                      const validSpontaneous = knownSpells.filter((spell) =>
                        spellLevelForEntry(entry, spell) === slot.spellLevel &&
                        canCastKnownSpell(entry, character.abilities, spell),
                      );
                      const chosen = spontaneousChoices[slot.id] ??
                        (validSpontaneous[0] ? spellKey(validSpontaneous[0]) : '');
                      const slotSpellId = mode === 'prepared' ? preparedId : chosen;
                      const chosenSpell = getSpell(slotSpellId);
                      const canAct = mode === 'prepared' ? Boolean(preparedSpell && !usage.used && slot.canCast) : Boolean(chosenSpell && !usage.used && canCastKnownSpell(entry, character.abilities, chosenSpell));
                      return <div className={`spell-slot ${usage.used ? 'slot-used' : ''}`} key={slot.id} data-testid={`slot-${slot.id}`}>
                        <span className={`slot-source source-${slot.source}`} title={sourceNames[slot.source]} aria-label={`Slot ${sourceNames[slot.source]}`}>{slot.source === 'classe' ? 'C' : slot.source === 'caratteristica' ? 'A' : slot.source === 'dominio' ? 'D' : slot.source === 'specializzazione' ? 'S' : '+'}</span>
                        {/*
                        {mode === 'prepared' ? <select aria-label={`Prepara incantesimo nello slot di ${summary.spellLevel}° livello`} value={preparedId ?? ''} disabled={usage.used} onChange={(e) => updateEntry(entry.id, (current) => ({ ...current, preparedSlots: e.target.value ? { ...current.preparedSlots, [slot.id]: e.target.value } : Object.fromEntries(Object.entries(current.preparedSlots).filter(([key]) => key !== slot.id)) }))} data-testid={`select-prepare-${slot.id}`}><option value="">Scegli incantesimo da preparare</option>{canPrepare.map((spell, idx) => <option value={spellKey(spell)} key={`${spellKey(spell)}-${idx}`}>{spell.name} · {getSpellLevelForClass(spell, entry.name)}°</option>}</select> : <select aria-label={`Scegli incantesimo da lanciare con slot di ${summary.spellLevel}° livello`} value={chosen} disabled={usage.used || validSpontaneous.length === 0} onChange={(e) => setSpontaneousChoices((current) => ({ ...current, [slot.id]: e.target.value }))} data-testid={`select-cast-spell-${slot.id}`}><option value="">Scegli incantesimo conosciuto</option>{validSpontaneous.map((spell, idx) => <option value={spell.id ?? spellKey(spell)} key={`${spellKey(spell)}-${idx}`}>{spell.name} · {getSpellLevelForClass(spell, entry.name)}°</option>)}</select>}
                        */}
                        {mode === 'prepared' ? (
                          <select
                            aria-label={`Prepara incantesimo nello slot di ${summary.spellLevel}° livello`}
                            value={preparedId ?? ''}
                            disabled={usage.used}
                            onChange={(event) => updatePreparedSpell(entry, slot.id, event.target.value)}
                            data-testid={`select-prepare-${slot.id}`}
                          >
                            <option value="">Scegli incantesimo da preparare</option>
                            {canPrepare.map((spell) => {
                              const spellLevel = spellLevelForEntry(entry, spell);
                              return <option value={spellKey(spell)} key={spellKey(spell)}>
                                {spell.name} · {spellLevel === 0 ? 'Trucchetto' : `${spellLevel}°`}
                              </option>;
                            })}
                          </select>
                        ) : (
                          <select
                            aria-label={`Scegli incantesimo da lanciare con slot di ${summary.spellLevel}° livello`}
                            value={chosen}
                            disabled={usage.used || validSpontaneous.length === 0}
                            onChange={(event) => setSpontaneousChoices((current) => ({ ...current, [slot.id]: event.target.value }))}
                            data-testid={`select-cast-spell-${slot.id}`}
                          >
                            <option value="">Scegli incantesimo conosciuto</option>
                            {validSpontaneous.map((spell) => {
                              const spellLevel = spellLevelForEntry(entry, spell);
                              return <option value={spellKey(spell)} key={spellKey(spell)}>
                                {spell.name} · {spellLevel === 0 ? 'Trucchetto' : `${spellLevel}°`}
                              </option>;
                            })}
                          </select>
                        )}
                        {usage.used ? (
                          <>
                            <span className="used-label"><Check size={13} /> Usato{getSpell(usage.spellId ?? undefined) ? ` · ${getSpell(usage.spellId ?? undefined)?.name}` : ''}</span>
                            <button className="slot-action undo" onClick={() => commitCharacter(restoreDailySlot(character, entry.id, slot.id))} data-testid={`button-undo-slot-${slot.id}`}>Annulla</button>
                          </>
                        ) : (
                          <button className="slot-action" disabled={!canAct} onClick={() => castSpellFromSlot(entry, slot.id, slotSpellId ?? '')} data-testid={`button-cast-slot-${slot.id}`}>Lancia</button>
                        )}
                        {!slot.canCast && <span className="slot-caution" title={`Richiede caratteristica ${slot.abilityScoreRequired}`} aria-label={`Non utilizzabile: richiede caratteristica ${slot.abilityScoreRequired}`}>!</span>}
                      </div>;
                    })}</div>
                  </div>)}</div> : <div className="no-slots"><p>Nessuno slot giornaliero disponibile a questo livello.</p><small>La tabella della classe non ha ancora sbloccato incantesimi o richiede un punteggio di caratteristica più alto.</small></div>}
                <div className="repertoire"><div className="repertoire-heading"><div><h3>Repertorio di {entry.name}</h3><p>{mode === 'prepared' ? 'Aggiungi alla lista per poter preparare gli incantesimi negli slot compatibili.' : 'Gli incantesimi conosciuti possono essere lanciati negli slot giornalieri disponibili.'}</p></div><span>{knownSpells.length} in scheda</span></div>
                  <div className="repertoire-add">
                    <div className="search-box"><Search size={15} /><input type="search" value={characterSearch} onChange={(e) => setCharacterSearch(e.target.value)} placeholder={`Cerca nel catalogo per ${entry.name}…`} aria-label={`Cerca incantesimi per ${entry.name}`} data-testid={`input-repertoire-search-${entry.id}`} /></div>
                    <div className="repertoire-catalog">
                      {classSpells.slice(0, 40).map((spell, index) => {
                        const identifier = spellKey(spell);
                        const included = entry.knownSpellIds.includes(identifier);
                        const officialLevel = getSpellLevelForClass(spell, entry.name);
                        const customLevelRequired = entry.customSpellcasting.enabled && !getCastingMode(entry.name) && officialLevel === null;
                        const customLevel = entry.customSpellLevels[identifier];
                        const customLevelTooHigh = customLevelRequired && customLevel !== undefined && customLevel > entry.customSpellcasting.maxSpellLevel;
                        const levelLabel = customLevelRequired
                          ? customLevel === undefined ? 'Livello da assegnare' : spellLevelName(customLevel)
                          : spellLevelName(spellLevelForEntry(entry, spell));
                        const draftKey = `${entry.id}:${identifier}`;
                        return <div className="repertoire-result" key={`${identifier}-${index}`}>
                          <span><b>{spell.name}</b><small>{spell.school} · {levelLabel}</small></span>
                          {customLevelRequired && (
                            <label className="custom-spell-level">
                              <span>Liv.</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]"
                                maxLength={1}
                                value={customSpellLevelDrafts[draftKey] ?? (customLevel === undefined ? '' : String(customLevel))}
                                aria-label={`Livello di ${spell.name} per ${entry.name}`}
                                onChange={(event) => changeCustomSpellLevel(entry, spell, event.currentTarget.value.replace(/\D/g, '').slice(0, 1))}
                                onBlur={() => clearCustomSpellLevelDraft(draftKey)}
                                data-testid={`input-custom-spell-level-${entry.id}-${index}`}
                              />
                            </label>
                          )}
                          <button disabled={included || Boolean(customLevelRequired && (customLevel === undefined || customLevelTooHigh))} onClick={() => addSpellToClass(entry, spell)} aria-label={included ? `${spell.name} già nel repertorio` : customLevelRequired && customLevel === undefined ? `Assegna un livello a ${spell.name}` : `Aggiungi ${spell.name} al repertorio`} data-testid={`button-add-spell-${entry.id}-${index}`}>{included ? <Check size={14} /> : <Plus size={14} />}{included ? 'Aggiunto' : 'Aggiungi'}</button>
                        </div>;
                      })}
                      {classSpells.length === 0 && <p className="repertoire-empty">Nessun incantesimo trovato. Prova un altro termine.</p>}
                      {classSpells.length > 40 && <p className="repertoire-more">Mostrati 40 risultati. Restringi la ricerca per trovare gli altri.</p>}
                    </div>
                  </div>
                  {knownSpells.length > 0 && <div className="known-list"><h4>Incantesimi nel repertorio</h4>{knownSpells.map((spell) => <div className="known-spell" key={spellKey(spell)}><span><button className="known-spell-detail" onClick={() => setCharacterSpellDetail(spell)} data-testid={`button-view-spell-detail-${entry.id}-${spellKey(spell)}`}>{spell.name}</button><small>{spellLevelName(spellLevelForEntry(entry, spell))} · {spell.school}</small></span><button aria-label={`Rimuovi ${spell.name} dal repertorio`} onClick={() => { if (window.confirm(`Rimuovere ${spell.name} dal repertorio di ${entry.name}? Le preparazioni salvate non verranno cancellate.`)) updateEntry(entry.id, (current) => ({ ...current, knownSpellIds: current.knownSpellIds.filter((id) => id !== spellKey(spell)) })); }} data-testid={`button-remove-spell-${entry.id}-${spellKey(spell)}`}><Trash2 size={13} /></button></div>)}</div>}
                  {characterSpellDetail && knownSpells.some((spell) => spellKey(spell) === spellKey(characterSpellDetail)) && (
                    <div className="character-spell-detail" data-testid={`spell-detail-character-${entry.id}`}>
                      <div className="character-spell-detail-heading">
                        <span>Dettaglio incantesimo</span>
                        <button onClick={() => setCharacterSpellDetail(null)} aria-label="Chiudi dettagli incantesimo">Chiudi</button>
                      </div>
                      <SpellDetail spell={characterSpellDetail} onBack={() => setCharacterSpellDetail(null)} />
                    </div>
                  )}
                </div>
              </section>;
            })}
          </div>
        </div>
      </section>}
      <footer className="page-footer"><span>ARCHIVIO INCANTESIMI D&D 3.5</span><span>NESSUNA CONNESSIONE NECESSARIA <span className="tiny-diamond">✦</span></span></footer>
    </main>
  );
}

function spellLevelName(level: number | null): string {
  return level === null ? 'Livello non indicato' : level === 0 ? 'Trucchetto' : `${level}° livello`;
}

export default App;
