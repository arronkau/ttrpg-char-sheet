import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadSpellCatalog } from "../lib/spellCatalog";
import type { SpellCatalogEntry } from "../types";

export function SpellsPage() {
  const [spells, setSpells] = useState<SpellCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [classId, setClassId] = useState("all");
  const [level, setLevel] = useState("all");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loadSpellCatalog()
      .then((catalog) => {
        if (!active) return;
        setSpells(catalog.spells);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load spells.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const classOptions = useMemo(
    () => Array.from(new Set(spells.flatMap((spell) => spell.normalizedClasses.map((spellClass) => spellClass.classId)))).sort(),
    [spells]
  );

  const levelOptions = useMemo(
    () => Array.from(new Set(spells.flatMap((spell) => spell.normalizedClasses.map((spellClass) => spellClass.level)))).sort((a, b) => a - b),
    [spells]
  );

  const filteredSpells = useMemo(
    () => {
      const normalizedQuery = query.toLowerCase();
      return spells.filter((spell) => {
        const matchesQuery = spell.searchText.includes(normalizedQuery);
        const matchesClass = classId === "all" || spell.normalizedClasses.some((spellClass) => spellClass.classId === classId);
        const matchesLevel = level === "all" || spell.normalizedClasses.some((spellClass) => String(spellClass.level) === level);
        return matchesQuery && matchesClass && matchesLevel;
      });
    },
    [classId, level, query, spells]
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
        <div className="reference-toolbar">
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
        </div>
        {loading ? <p className="empty-row">Loading spells</p> : null}
        {error ? <p className="empty-row">{error}</p> : null}
        {!loading && !error ? <div className="reference-results-summary">{filteredSpells.length} spells</div> : null}
        <div className="reference-row-list">
          {filteredSpells.map((spell) => (
            <article className="reference-row" key={spell.id}>
              <div className="reference-row-main">
                <header>
                  <h3>{spell.name}</h3>
                  <div className="metadata-pills">
                    <span>{spell.classSummary}</span>
                    <span>Range {spell.range ?? "—"}</span>
                    <span>Duration {spell.duration ?? "—"}</span>
                    <span>Save {spell.save ?? "—"}</span>
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
