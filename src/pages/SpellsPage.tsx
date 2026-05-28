import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useCampaignStore } from "../store/campaignStore";

function spellClassSummary(spell: { normalizedClasses: Array<{ classId: string; level: number }> }): string {
  return spell.normalizedClasses.map((spellClass) => `${spellClass.classId} ${spellClass.level}`).join(", ");
}

export function SpellsPage() {
  const spells = useCampaignStore((state) => state.catalogs.spells);
  const [query, setQuery] = useState("");
  const [classId, setClassId] = useState("all");
  const [level, setLevel] = useState("all");
  const [adaptation, setAdaptation] = useState("all");

  const classOptions = useMemo(
    () => Array.from(new Set(spells.flatMap((spell) => spell.normalizedClasses.map((spellClass) => spellClass.classId)))).sort(),
    [spells]
  );

  const levelOptions = useMemo(
    () => Array.from(new Set(spells.flatMap((spell) => spell.normalizedClasses.map((spellClass) => spellClass.level)))).sort((a, b) => a - b),
    [spells]
  );

  const filteredSpells = useMemo(
    () =>
      spells.filter((spell) => {
        const text = [
          spell.name,
          spell.description,
          spell.source,
          spell.range,
          spell.duration,
          spell.save,
          spell.area,
          spell.target,
          spellClassSummary(spell)
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const matchesQuery = text.includes(query.toLowerCase());
        const matchesClass = classId === "all" || spell.normalizedClasses.some((spellClass) => spellClass.classId === classId);
        const matchesLevel = level === "all" || spell.normalizedClasses.some((spellClass) => String(spellClass.level) === level);
        const matchesAdaptation =
          adaptation === "all" || (adaptation === "adapted" && spell.isAdapted) || (adaptation === "standard" && !spell.isAdapted);
        return matchesQuery && matchesClass && matchesLevel && matchesAdaptation;
      }),
    [adaptation, classId, level, query, spells]
  );

  return (
    <main className="page-stack">
      <section className="panel reference-page">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Reference</p>
            <h2>Spells</h2>
            <p className="muted-copy">Compact spell reference with class, level, range, duration, and save metadata.</p>
          </div>
          <Search size={18} />
        </div>
        <div className="reference-toolbar reference-toolbar-four">
          <label>
            <span>Search</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="name, text, range…" />
          </label>
          <label>
            <span>Class</span>
            <select value={classId} onChange={(event) => setClassId(event.target.value)}>
              <option value="all">All classes</option>
              {classOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Level</span>
            <select value={level} onChange={(event) => setLevel(event.target.value)}>
              <option value="all">All levels</option>
              {levelOptions.map((option) => (
                <option key={option} value={String(option)}>
                  Level {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Source</span>
            <select value={adaptation} onChange={(event) => setAdaptation(event.target.value)}>
              <option value="all">All spells</option>
              <option value="standard">Standard</option>
              <option value="adapted">Adapted</option>
            </select>
          </label>
        </div>
        <div className="reference-results-summary">{filteredSpells.length} spells</div>
        <div className="reference-row-list">
          {filteredSpells.map((spell) => (
            <article className="reference-row" key={spell.id}>
              <div className="reference-row-main">
                <header>
                  <h3>{spell.name}</h3>
                  <div className="metadata-pills">
                    <span>{spellClassSummary(spell)}</span>
                    <span>Range {spell.range ?? "—"}</span>
                    <span>Duration {spell.duration ?? "—"}</span>
                    <span>Save {spell.save ?? "—"}</span>
                    {spell.isAdapted ? <span>adapted</span> : null}
                  </div>
                </header>
                <p>{spell.description}</p>
                <footer className="metadata-line">
                  {spell.area ? <span>Area {spell.area}</span> : null}
                  {spell.target ? <span>Target {spell.target}</span> : null}
                  {spell.source ? <span>{spell.source}</span> : null}
                  {spell.sourceCitationText ? <span>{spell.sourceCitationText}</span> : null}
                </footer>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
