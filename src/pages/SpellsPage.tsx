import { Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useCampaignStore } from "../store/campaignStore";

export function SpellsPage() {
  const spells = useCampaignStore((state) => state.catalogs.spells);
  const [query, setQuery] = useState("");
  const [classId, setClassId] = useState("all");

  const filteredSpells = useMemo(
    () =>
      spells.filter((spell) => {
        const text = `${spell.name} ${spell.description} ${spell.source ?? ""}`.toLowerCase();
        const matchesQuery = text.includes(query.toLowerCase());
        const matchesClass = classId === "all" || spell.normalizedClasses.some((spellClass) => spellClass.classId === classId);
        return matchesQuery && matchesClass;
      }),
    [spells, query, classId]
  );

  return (
    <main className="page-stack">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Reference</p>
            <h2>Spells</h2>
          </div>
          <Search size={18} />
        </div>
        <div className="toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="all">all</option>
            <option value="magic-user">magic-user</option>
            <option value="illusionist">illusionist</option>
          </select>
        </div>
        <div className="spell-list">
          {filteredSpells.map((spell) => (
            <article className="spell-row" key={spell.id}>
              <Sparkles size={17} />
              <div>
                <header>
                  <h3>{spell.name}</h3>
                  <span>{spell.normalizedClasses.map((spellClass) => `${spellClass.classId} ${spellClass.level}`).join(", ")}</span>
                </header>
                <p>{spell.description}</p>
                <footer>
                  <span>Range {spell.range ?? "—"}</span>
                  <span>Duration {spell.duration ?? "—"}</span>
                  <span>Save {spell.save ?? "—"}</span>
                </footer>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
