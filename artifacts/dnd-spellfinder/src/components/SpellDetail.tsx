import { ArrowLeft, BookOpen, Clock3, Crosshair, Focus, Gem, Layers3, Moon, Sparkles } from 'lucide-react';
import type { Spell } from '../lib/spells';

type SpellDetailProps = { spell: Spell; onBack: () => void };

function levelSummary(spell: Spell): string {
  const levels = [...new Set(spell.classLevels.map((entry) => entry.level))].sort((a, b) => a - b);
  if (!levels.length) return 'Livello non indicato';
  return levels.length === 1
    ? `Incantesimo di ${levels[0]}° livello`
    : `Livelli ${levels.map((level) => `${level}°`).join(', ')}`;
}

function statusLabel(status: string): string {
  if (status.includes('solo_lista')) return 'Presente solo nella lista; scheda da verificare';
  if (status.includes('parziale')) return 'Estrazione parziale: verifica sul manuale';
  if (status.includes('ricca') || status.includes('ocr')) return 'Testo estratto da OCR: verifica sul manuale';
  return status || 'Stato della fonte non indicato';
}

export function SpellDetail({ spell, onBack }: SpellDetailProps) {
  return (
    <article className="spell-detail" data-testid={`detail-${spell.name.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="detail-topline"><button className="detail-back" onClick={onBack} data-testid="button-detail-back"><ArrowLeft size={15} /> Elenco</button><span className="detail-index">SCHEDA ARCANA <span>—</span> {String(spell.level).padStart(2, '0')}</span></div>
      <div className="detail-title-block">
        <div className="detail-school-mark"><Sparkles size={17} strokeWidth={1.3} /></div>
        <div className="detail-school">{spell.school.toUpperCase()}</div>
        <h2>{spell.name}</h2>
         <div className="detail-level">{levelSummary(spell)}</div>
      </div>
      <div className="detail-rule" />
      <div className="detail-facts">
        <div className="fact-item"><Clock3 size={15} /><div><span>Tempo di lancio</span><b>{spell.castingTime || '—'}</b></div></div>
        <div className="fact-item"><Crosshair size={15} /><div><span>Gittata</span><b>{spell.range || '—'}</b></div></div>
        <div className="fact-item"><Gem size={15} /><div><span>Componenti</span><b>{spell.components || '—'}</b></div></div>
        <div className="fact-item"><Layers3 size={15} /><div><span>Durata</span><b>{spell.duration || '—'}</b></div></div>
      </div>
      {(spell.concentration || spell.ritual) && <div className="detail-traits">{spell.concentration && <span><Focus size={13} /> Concentrazione</span>}{spell.ritual && <span><Moon size={13} /> Rituale</span>}</div>}
        <section className="materials-section">
          <h3><Gem size={14} /> MATERIALI E FOCUS</h3>
          {spell.materialDetails.length > 0 && (
            <div className="material-list">
              {spell.materialDetails.map((detail) => (
                <div className="material-entry" key={`${detail.label}-${detail.value}`}>
                  <strong>{detail.label}</strong>
                  <p>{detail.value}</p>
                </div>
              ))}
            </div>
          )}
          {spell.materialDetailRequiredButMissing ? (
            <p className="material-note">La scheda indica un componente materiale, un focus o un costo PE, ma il dettaglio non è presente nel JSON.</p>
          ) : spell.materialDetails.length === 0 ? (
            <p className="material-note">Nessun componente materiale, focus o costo PE specifico indicato; i componenti base sono elencati sopra.</p>
          ) : null}
          <div className="material-provenance" role="note">
            {spell.componentSource
              ? `${spell.componentSource} · Dati importati; verifica consigliata.`
              : 'Fonte dei componenti non indicata.'}
          </div>
        </section>
        <section className="description-section">
          <h3>
            <BookOpen size={14} /> DESCRIZIONE
            <span className={`description-badge ${spell.hasFullDescription ? 'complete' : 'summary'}`}>
              {spell.hasFullDescription ? 'TESTO INTEGRALE' : 'RIASSUNTO'}
            </span>
          </h3>
          <p>{spell.description || 'Nessuna descrizione disponibile per questo incantesimo.'}</p>
          <div className="description-provenance" role="note">
            {spell.hasFullDescription
              ? `${spell.descriptionSource || 'Fonte non indicata'} · ${spell.descriptionIsOcr ? 'OCR da controllare sul PDF.' : 'Testo importato; verifica consigliata.'}${spell.status.includes('varianti') ? ' Il file contiene più varianti di testo: confrontarle con la fonte.' : ''}`
              : 'Testo integrale non disponibile; è mostrato il riassunto del catalogo.'}
          </div>
        </section>
       {spell.target && <section className="description-section"><h3>BERSAGLIO / AREA</h3><p>{spell.target}</p></section>}
       {(spell.savingThrow || spell.spellResistance) && <section className="spell-rules"><h3>REGOLE</h3>{spell.savingThrow && <p><b>Tiro salvezza:</b> {spell.savingThrow}</p>}{spell.spellResistance && <p><b>Resistenza agli incantesimi:</b> {spell.spellResistance}</p>}</section>}
       <section className="classes-section"><h3>CLASSI E LIVELLI</h3><div className="class-chips">{spell.classLevels.length ? spell.classLevels.map((entry) => <span key={`${entry.className}-${entry.level}`}>{entry.className} · {entry.level}°</span>) : spell.classes.length ? spell.classes.map((spellClass) => <span key={spellClass}>{spellClass}</span>) : <span>Non specificate</span>}</div></section>
       <div className="archive-source">{spell.source && <span>{spell.source}</span>}{spell.page !== null && <span>Pagina {spell.page}</span>}</div>
        {spell.status && !spell.hasFullDescription && <div className="archive-status" role="note">{statusLabel(spell.status)}</div>}
        <div className="detail-bottom-note"><span>Archivio D&amp;D 3.5 · fonti e riferimenti riportati nella scheda</span></div>
    </article>
  );
}
