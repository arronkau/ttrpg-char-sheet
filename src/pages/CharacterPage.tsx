import { Save } from "lucide-react";
import { useMemo, useState } from "react";
import { abilityModifier, buildInventoryTree, displayName, entrySlots, summarizeEntity } from "../lib/rules";
import { useCampaignStore } from "../store/campaignStore";
import type { AbilityScores, Catalogs, ClassDefinition, Entity, InventoryEntry, ViewMode } from "../types";

const abilityRows: Array<{ key: keyof AbilityScores; label: string; abbr: string }> = [
  { key: "strength", label: "Strength", abbr: "STR" },
  { key: "intelligence", label: "Intelligence", abbr: "INT" },
  { key: "wisdom", label: "Wisdom", abbr: "WIS" },
  { key: "dexterity", label: "Dexterity", abbr: "DEX" },
  { key: "constitution", label: "Constitution", abbr: "CON" },
  { key: "charisma", label: "Charisma", abbr: "CHA" }
];

const saveLabels: Record<string, string> = {
  death_poison: "Death",
  magic_wands: "Wands",
  paralysis_petrify: "Paralysis",
  breath_attacks: "Breath",
  spells: "Spells"
};

export function CharacterPage() {
  const entities = useCampaignStore((state) => state.entities);
  const inventoryEntries = useCampaignStore((state) => state.inventoryEntries);
  const catalogs = useCampaignStore((state) => state.catalogs);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const updateEntity = useCampaignStore((state) => state.updateEntity);
  const characterEntities = entities.filter((entity) => ["character", "retainer", "hireling"].includes(entity.type));
  const [selectedId, setSelectedId] = useState(characterEntities[0]?.id ?? "");
  const entity = characterEntities.find((candidate) => candidate.id === selectedId) ?? characterEntities[0];
  const classDef = entity?.classId ? catalogs.classesById[entity.classId] : undefined;
  const summary = entity ? summarizeEntity(entity, inventoryEntries, catalogs, viewMode) : null;
  const entityEntries = useMemo(() => inventoryEntries.filter((entry) => entry.entityId === entity?.id), [inventoryEntries, entity?.id]);
  const tree = useMemo(() => buildInventoryTree(entityEntries, catalogs), [entityEntries, catalogs]);

  if (!entity || !summary) {
    return (
      <main className="page-stack">
        <section className="panel">No character entities</section>
      </main>
    );
  }

  const patchEntity = (patch: Partial<Entity>) => {
    void updateEntity({ ...entity, ...patch });
  };

  const rootEntries = entityEntries.filter((entry) => entry.location.kind === "equipped");
  const tinyEntries = entityEntries.filter((entry) => entrySlots(entry, catalogs) === 0);
  const equippedEntries = rootEntries.filter((entry) => entrySlots(entry, catalogs) > 0);
  const stowedEntries = entityEntries.filter((entry) => entry.location.kind === "contained" && entrySlots(entry, catalogs) > 0);
  const languages = entity.languages?.length ? entity.languages.join(", ") : "—";
  const attack = formatSigned(summary.attackModifier ?? 0);
  const melee = formatSigned((summary.attackModifier ?? 0) + abilityModifier(entity.abilities?.strength));
  const ranged = formatSigned((summary.attackModifier ?? 0) + abilityModifier(entity.abilities?.dexterity));
  const todos = missingSheetData(entity, classDef);

  return (
    <main className="page-grid sheet-page">
      <section className="panel sheet-toolbar">
        <div>
          <p className="eyebrow">Character Sheet</p>
          <h2>{entity.name}</h2>
        </div>
        <label>
          Active character
          <select value={entity.id} onChange={(event) => setSelectedId(event.target.value)}>
            {characterEntities.map((candidate) => (
              <option value={candidate.id} key={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="ose-sheet">
        <header className="sheet-identity-grid">
          <SheetField label="Name">
            <input value={entity.name} onChange={(event) => patchEntity({ name: event.target.value })} />
          </SheetField>
          <SheetField label="Class">
            <select value={entity.classId ?? ""} onChange={(event) => patchEntity({ classId: event.target.value })}>
              <option value="">None</option>
              {catalogs.classes.map((candidate) => (
                <option value={candidate.id} key={candidate.id}>
                  {candidate.class_name}
                </option>
              ))}
            </select>
          </SheetField>
          <SheetField label="Level">
            <output>{summary.level ?? "—"}</output>
          </SheetField>
          <SheetField label="Next Level">
            <output>{summary.xpForNextLevel ?? "Max"}</output>
          </SheetField>
          <SheetField label="Alignment">
            <input value={entity.alignment ?? ""} onChange={(event) => patchEntity({ alignment: event.target.value })} />
          </SheetField>
          <SheetField label="XP">
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={entity.xp ?? 0} onChange={(event) => patchEntity({ xp: Number(event.target.value) })} />
          </SheetField>
          <SheetField label="Player">
            <input value={entity.playerName ?? ""} onChange={(event) => patchEntity({ playerName: event.target.value })} />
          </SheetField>
          <SheetField label="Kindred / Race">
            <output>{entity.raceId ?? "—"}</output>
          </SheetField>
        </header>

        <div className="sheet-grid-main">
          <section className="sheet-box abilities-box">
            <h3>Ability Scores</h3>
            <AbilityTable entity={entity} patchEntity={patchEntity} />
            <p className="sheet-help">Ability checks: roll 1d6, add modifier, target 4.</p>
          </section>

          <section className="sheet-box combat-box">
            <h3>Combat</h3>
            <div className="combat-grid">
              <SheetField label="HP Current">
                <input type="text" inputMode="numeric" pattern="[0-9]*" value={entity.hp?.currentHp ?? 0} onChange={(event) => patchEntity({ hp: { currentHp: Number(event.target.value), maxHp: entity.hp?.maxHp ?? 1 } })} />
              </SheetField>
              <SheetField label="HP Max">
                <input type="text" inputMode="numeric" pattern="[0-9]*" value={entity.hp?.maxHp ?? 1} onChange={(event) => patchEntity({ hp: { currentHp: entity.hp?.currentHp ?? 1, maxHp: Number(event.target.value) } })} />
              </SheetField>
              <SheetField label="AC">
                <output>{summary.armorClass ?? "—"}</output>
              </SheetField>
              <SheetField label="Attack">
                <output>{attack}</output>
              </SheetField>
              <SheetField label="Melee">
                <output>{melee}</output>
              </SheetField>
              <SheetField label="Ranged">
                <output>{ranged}</output>
              </SheetField>
            </div>
            <p className="sheet-help">AC is armour + DEX modifier. Melee includes STR. Ranged includes DEX.</p>
          </section>

          <section className="sheet-box movement-box">
            <h3>Movement</h3>
            <div className="movement-grid">
              <SheetField label="Speed">
                <output>{summary.movementEncounter}</output>
              </SheetField>
              <SheetField label="Exploring">
                <output>{summary.movementExploration}</output>
              </SheetField>
              <SheetField label="Overland">
                <output>{Math.floor(summary.movementExploration / 5)}</output>
              </SheetField>
              <SheetField label="Load">
                <output>{summary.carriedSlots} slots</output>
              </SheetField>
            </div>
            <p className="sheet-help">Encounter speed is feet per round. Exploring is feet per turn. Overland is derived as exploring speed / 5.</p>
          </section>

          <section className="sheet-box saves-box">
            <h3>Saving Throws</h3>
            <div className="save-grid sheet-save-grid">
              {Object.entries(summary.savingThrows ?? {}).map(([key, value]) => (
                <div key={key}>
                  <span>{saveLabels[key] ?? titleCase(key)}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="sheet-box skills-box">
            <h3>Skill Targets</h3>
            <SkillTable classDef={classDef} />
            <p className="sheet-help">Skill checks: roll 1d6 vs target number. These are class-data driven where available.</p>
          </section>

          <section className="sheet-box features-box">
            <h3>Kindred & Class Abilities</h3>
            <p className="sheet-subhead">Languages: {languages}</p>
            <FeatureText classDef={classDef} />
            <label className="notes-block">
              Public notes
              <textarea value={entity.notes?.publicNotes ?? ""} onChange={(event) => patchEntity({ notes: { ...entity.notes, publicNotes: event.target.value } })} />
            </label>
            {viewMode === "gm" && (
              <label className="notes-block">
                Referee notes
                <textarea value={entity.notes?.refereeNotes ?? ""} onChange={(event) => patchEntity({ notes: { ...entity.notes, refereeNotes: event.target.value } })} />
              </label>
            )}
          </section>

          <section className="sheet-box inventory-sheet-box">
            <h3>Inventory</h3>
            <div className="inventory-sheet-grid">
              <InventoryList title="Tiny Items" entries={tinyEntries} catalogs={catalogs} viewMode={viewMode} />
              <InventoryList title="Equipped Items" entries={equippedEntries} catalogs={catalogs} viewMode={viewMode} />
              <InventoryList title="Stowed Items" entries={stowedEntries} catalogs={catalogs} viewMode={viewMode} />
            </div>
            <div className="load-track" aria-label="Speed by carried slot load">
              <span>40</span><span>30</span><span>20</span><span>10</span>
            </div>
            <p className="sheet-help">Retrieving stowed items takes 1 round. Container capacity and over-capacity warnings are still handled by the inventory view.</p>
          </section>
        </div>
      </section>

      <aside className="panel sheet-sidebar">
        <div className="section-heading">
          <h2>Derived / TODO</h2>
          <Save size={17} />
        </div>
        <div className="derived-list">
          <div><span>Encumbrance</span><strong>{summary.encumbranceLabel}</strong></div>
          <div><span>Equipped</span><strong>{summary.equippedSlots} slots</strong></div>
          <div><span>Stowed</span><strong>{summary.stowedSlots} slots</strong></div>
        </div>
        {summary.activeLights.length > 0 && (
          <>
            <h3>Active Lights</h3>
            <div className="flat-list">
              {summary.activeLights.map((light) => (
                <div className="flat-row" key={light.entryId}>
                  <span>{light.name}</span>
                  <small>{light.turnsRemaining ?? "—"} turns</small>
                </div>
              ))}
            </div>
          </>
        )}
        {summary.warnings.length > 0 && (
          <>
            <h3>Warnings</h3>
            <div className="flat-list">
              {summary.warnings.map((warning, index) => <p className="warning-note" key={`${warning.message}-${index}`}>{warning.message}</p>)}
            </div>
          </>
        )}
        <h3>Remaining TODO</h3>
        <ul className="todo-list">
          {todos.map((todo) => <li key={todo}>{todo}</li>)}
        </ul>
        <h3>All Carried Entries</h3>
        <div className="flat-list">
          {tree.allNodes.map((node) => (
            <div className="flat-row" key={node.entry.id}>
              <span>{displayName(node.entry, catalogs, viewMode)}</span>
              <small>{node.entry.quantity}</small>
            </div>
          ))}
        </div>
      </aside>
    </main>
  );
}

function SheetField({ label, children }: { label: string; children: import("react").ReactNode }) {
  return <label className="sheet-field"><span>{label}</span>{children}</label>;
}

function AbilityTable({ entity, patchEntity }: { entity: Entity; patchEntity: (patch: Partial<Entity>) => void }) {
  const abilities = entity.abilities ?? {
    strength: 10,
    intelligence: 10,
    wisdom: 10,
    dexterity: 10,
    constitution: 10,
    charisma: 10
  };

  return (
    <div className="ability-table">
      <div className="ability-table-head"><span>Ability</span><span>Score</span><span>Mod</span></div>
      {abilityRows.map(({ key, label, abbr }) => (
        <div className="ability-row" key={key}>
          <span>{label} <em>{abbr}</em></span>
          <input type="text" inputMode="numeric" pattern="[0-9]*" min={3} max={18} value={abilities[key]} onChange={(event) => patchEntity({ abilities: { ...abilities, [key]: Number(event.target.value) } })} />
          <output>{formatSigned(abilityModifier(abilities[key]))}</output>
        </div>
      ))}
    </div>
  );
}

function SkillTable({ classDef }: { classDef: ClassDefinition | undefined }) {
  const skillRows = classDef?.skill_notes?.length
    ? classDef.skill_notes.map((skill) => ({ name: skill.name, target: skill.text.match(/\d(?:-in-6| in 6|\/6)?/i)?.[0] ?? "—" }))
    : ["Listen", "Search", "Survival"].map((name) => ({ name, target: "—" }));

  return (
    <div className="skill-table">
      {skillRows.slice(0, 8).map((skill) => (
        <div key={skill.name}><span>{skill.name}</span><strong>{skill.target}</strong></div>
      ))}
    </div>
  );
}

function FeatureText({ classDef }: { classDef: ClassDefinition | undefined }) {
  const spellList = classDef?.proficiencies?.spell_list?.id;
  return (
    <div className="feature-text">
      {spellList && <p><strong>Spell list:</strong> {spellList}</p>}
      {classDef?.feature_text_raw ? <p>{classDef.feature_text_raw}</p> : <p>No class ability text recorded.</p>}
    </div>
  );
}

function InventoryList({ title, entries, catalogs, viewMode }: { title: string; entries: InventoryEntry[]; catalogs: Catalogs; viewMode: ViewMode }) {
  return (
    <div className="sheet-inventory-list">
      <h4>{title}</h4>
      {entries.length === 0 ? <p className="empty-row">—</p> : entries.map((entry) => (
        <div key={entry.id}>
          <span>{displayName(entry, catalogs, viewMode)}</span>
          <small>{entry.quantity} × {entrySlots(entry, catalogs)} slot{entrySlots(entry, catalogs) === 1 ? "" : "s"}</small>
        </div>
      ))}
    </div>
  );
}

function missingSheetData(entity: Entity, classDef: ClassDefinition | undefined): string[] {
  const todos: string[] = [];
  if (!entity.raceId) todos.push("Add a real kindred/race field or map race-as-class data into this sheet.");
  if (!classDef?.skill_notes?.length) todos.push("Add normalized skill targets for this class if table-ready skill display is needed.");
  if (!entity.spellcasting && classDef?.proficiencies?.spell_list) todos.push("Add spell slots, memorized spells, and spellbook display for spellcasters.");
  if (!entity.notes?.publicNotes) todos.push("Use public notes for background, description, retainers, debts, and other non-derived sheet text.");
  return todos.length ? todos : ["No blocking sheet-data TODO detected for this character." ];
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
