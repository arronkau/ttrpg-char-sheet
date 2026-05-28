import { ChevronDown, ChevronRight, Edit3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  abilityModifier,
  buildInventoryTree,
  carriedLoadCategory,
  classHitDice,
  classSkillRows,
  displayName,
  entrySlots,
  expertisePointsForLevel,
  formatEncounterMovement,
  formatExplorationMovement,
  formatOverlandMovement,
  summarizeEntity,
  unspentSkillPoints,
  type SkillRow
} from "../lib/rules";
import { useCampaignStore } from "../store/campaignStore";
import type { AbilityScores, Catalogs, ClassDefinition, Entity, InventoryNode, ViewMode } from "../types";

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
  wands: "Wands",
  magic_wands: "Wands",
  paralysis_petrify: "Paralysis",
  breath_attacks: "Breath",
  spells: "Spells",
  spells_rods_staves: "Spells"
};

export function CharacterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const entities = useCampaignStore((state) => state.entities);
  const inventoryEntries = useCampaignStore((state) => state.inventoryEntries);
  const catalogs = useCampaignStore((state) => state.catalogs);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const updateEntity = useCampaignStore((state) => state.updateEntity);
  const characterEntities = useMemo(
    () => entities.filter((entity) => ["character", "retainer", "hireling"].includes(entity.type)),
    [entities]
  );
  const requestedEntityId = searchParams.get("entityId") ?? "";
  const [selectedId, setSelectedId] = useState(requestedEntityId || characterEntities[0]?.id || "");
  const [isEditing, setIsEditing] = useState(false);
  const entity = characterEntities.find((candidate) => candidate.id === selectedId) ?? characterEntities[0];
  const classDef = entity?.classId ? catalogs.classesById[entity.classId] : undefined;
  const summary = entity ? summarizeEntity(entity, inventoryEntries, catalogs, viewMode) : null;
  const entityEntries = useMemo(() => inventoryEntries.filter((entry) => entry.entityId === entity?.id), [inventoryEntries, entity?.id]);
  const tree = useMemo(() => buildInventoryTree(entityEntries, catalogs), [entityEntries, catalogs]);

  useEffect(() => {
    if (requestedEntityId) {
      setSelectedId(requestedEntityId);
      setIsEditing(false);
    }
  }, [requestedEntityId]);

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

  const rootNodes = tree.byEntityId[entity.id] ?? [];
  const equippedNodes = rootNodes.filter((node) => carriedLoadCategory(node.entry, entityEntries, catalogs) === "equipped");
  const stowedNodes = rootNodes.filter((node) => carriedLoadCategory(node.entry, entityEntries, catalogs) === "stowed");
  const languages = entity.languages?.length ? entity.languages.join(", ") : "-";
  const melee = formatSigned((summary.attackModifier ?? 0) + abilityModifier(entity.abilities?.strength));
  const missile = formatSigned((summary.attackModifier ?? 0) + abilityModifier(entity.abilities?.dexterity));
  const skillRows = classSkillRows(classDef, summary.level, entity.skills?.allocatedPoints);
  const skillPointsEnabled = entity.skills?.skillPointsEnabled === true;
  const availableSkillPoints = expertisePointsForLevel(classDef, summary.level);
  const remainingSkillPoints = unspentSkillPoints(entity, classDef, summary.level);

  return (
    <main className="page-grid sheet-page">
      <section className="panel sheet-toolbar">
        <div>
          <p className="eyebrow">Character Sheet</p>
          <h2>{entity.name}</h2>
        </div>
        <div className="sheet-toolbar-controls">
          <label>
            Active character
            <select
              value={entity.id}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setSearchParams({ entityId: event.target.value });
                setIsEditing(false);
              }}
            >
              {characterEntities.map((candidate) => (
                <option value={candidate.id} key={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
          <button className={isEditing ? "toggle active" : "toggle"} onClick={() => setIsEditing((value) => !value)} title="Edit sheet">
            <Edit3 size={16} />
            Edit
          </button>
        </div>
      </section>

      <section className="ose-sheet">
        <header className="sheet-identity-grid">
          <SheetField label="Name">
            {isEditing ? <input value={entity.name} onChange={(event) => patchEntity({ name: event.target.value })} /> : <output>{entity.name}</output>}
          </SheetField>
          <SheetField label="Class">
            {isEditing ? (
              <select value={entity.classId ?? ""} onChange={(event) => patchEntity({ classId: event.target.value })}>
                <option value="">None</option>
                {catalogs.classes.map((candidate) => (
                  <option value={candidate.id} key={candidate.id}>
                    {candidate.class_name}
                  </option>
                ))}
              </select>
            ) : (
              <output>{classDef?.class_name ?? "-"}</output>
            )}
          </SheetField>
          <SheetField label="Level">
            <output>{summary.level ?? "-"}</output>
          </SheetField>
          <SheetField label="Next Level">
            <output>{summary.xpForNextLevel ?? "Max"}</output>
          </SheetField>
          <SheetField label="Alignment">
            {isEditing ? <input value={entity.alignment ?? ""} onChange={(event) => patchEntity({ alignment: event.target.value })} /> : <output>{entity.alignment ?? "-"}</output>}
          </SheetField>
          <SheetField label="XP">
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={entity.xp ?? 0} onChange={(event) => patchEntity({ xp: Number(event.target.value) })} />
          </SheetField>
          <SheetField label="Player">
            {isEditing ? <input value={entity.playerName ?? ""} onChange={(event) => patchEntity({ playerName: event.target.value })} /> : <output>{entity.playerName ?? "-"}</output>}
          </SheetField>
        </header>

        <div className="sheet-grid-main">
          <section className="sheet-box abilities-box">
            <h3>Ability Scores</h3>
            <AbilityTable entity={entity} patchEntity={patchEntity} isEditing={isEditing} />
            <p className="sheet-help">Ability checks: roll 1d6, add modifier, target 4.</p>
          </section>

          <section className="sheet-box combat-box">
            <h3>Combat</h3>
            <div className="combat-grid">
              <SheetField label="HP Current">
                <input type="text" inputMode="numeric" pattern="[0-9]*" value={entity.hp?.currentHp ?? 0} onChange={(event) => patchEntity({ hp: { currentHp: Number(event.target.value), maxHp: entity.hp?.maxHp ?? 1 } })} />
              </SheetField>
              <SheetField label="HP Max">
                {isEditing ? (
                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={entity.hp?.maxHp ?? 1} onChange={(event) => patchEntity({ hp: { currentHp: entity.hp?.currentHp ?? 1, maxHp: Number(event.target.value) } })} />
                ) : (
                  <output>{entity.hp?.maxHp ?? 1}</output>
                )}
              </SheetField>
              <SheetField label="AC">
                <output>{summary.armorClass ?? "-"}</output>
              </SheetField>
              <SheetField label="Melee">
                <output>{melee}</output>
              </SheetField>
              <SheetField label="Missile">
                <output>{missile}</output>
              </SheetField>
              <SheetField label="Hit Die">
                <output>{classHitDice(classDef, entity.xp) ?? "-"}</output>
              </SheetField>
            </div>
            <p className="sheet-help">AC is armour + DEX modifier. Melee includes STR. Missile includes DEX.</p>
          </section>

          <section className="sheet-box movement-box">
            <h3>Movement</h3>
            <div className="movement-grid">
              <SheetField label="Encounter">
                <output>{formatEncounterMovement(summary.movementEncounter)}</output>
              </SheetField>
              <SheetField label="Exploring">
                <output>{formatExplorationMovement(summary.movementExploration)}</output>
              </SheetField>
              <SheetField label="Overland">
                <output>{formatOverlandMovement(summary.movementExploration)}</output>
              </SheetField>
            </div>
            <p className="sheet-help">Encounter speed is feet per round. Exploring is feet per turn. Overland is miles per day.</p>
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
            <div className="sheet-box-header">
              <h3>Skill Targets</h3>
              {availableSkillPoints > 0 && (
                <label className="sheet-toggle">
                  <input
                    type="checkbox"
                    checked={skillPointsEnabled}
                    disabled={!isEditing}
                    onChange={(event) =>
                      patchEntity({
                        skills: {
                          ...entity.skills,
                          skillPointsEnabled: event.target.checked
                        }
                      })
                    }
                  />
                  Skill points
                </label>
              )}
            </div>
            {skillPointsEnabled && remainingSkillPoints > 0 && (
              <p className="skill-points-note">Available skill points to allocate: {remainingSkillPoints}</p>
            )}
            <SkillTable rows={skillRows} entity={entity} patchEntity={patchEntity} skillPointsEnabled={skillPointsEnabled} isEditing={isEditing} />
            <p className="sheet-help">Defaults are 1-in-6 unless class data supplies a better table value.</p>
          </section>

          <section className="sheet-box features-box">
            <h3>Class Abilities</h3>
            <p className="sheet-subhead">Languages: {languages}</p>
            <FeatureText classDef={classDef} />
            <label className="notes-block">
              Public notes
              <textarea readOnly={!isEditing} value={entity.notes?.publicNotes ?? ""} onChange={(event) => patchEntity({ notes: { ...entity.notes, publicNotes: event.target.value } })} />
            </label>
            {viewMode === "gm" && (
              <label className="notes-block">
                Referee notes
                <textarea readOnly={!isEditing} value={entity.notes?.refereeNotes ?? ""} onChange={(event) => patchEntity({ notes: { ...entity.notes, refereeNotes: event.target.value } })} />
              </label>
            )}
          </section>

          <section className="sheet-box inventory-sheet-box">
            <h3>Inventory</h3>
            <div className="inventory-sheet-grid">
              <SheetInventoryTree title="Equipped" nodes={equippedNodes} catalogs={catalogs} viewMode={viewMode} />
              <SheetInventoryTree title="Stowed" nodes={stowedNodes} catalogs={catalogs} viewMode={viewMode} />
            </div>
            <p className="sheet-help">Containers include their contents and start collapsed here for quick table scanning.</p>
          </section>
        </div>
      </section>
    </main>
  );
}

function SheetField({ label, children }: { label: string; children: import("react").ReactNode }) {
  return <label className="sheet-field"><span>{label}</span>{children}</label>;
}

function AbilityTable({ entity, patchEntity, isEditing }: { entity: Entity; patchEntity: (patch: Partial<Entity>) => void; isEditing: boolean }) {
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
          {isEditing ? (
            <input type="text" inputMode="numeric" pattern="[0-9]*" min={3} max={18} value={abilities[key]} onChange={(event) => patchEntity({ abilities: { ...abilities, [key]: Number(event.target.value) } })} />
          ) : (
            <output>{abilities[key]}</output>
          )}
          <output>{formatSigned(abilityModifier(abilities[key]))}</output>
        </div>
      ))}
    </div>
  );
}

function SkillTable({
  rows,
  entity,
  patchEntity,
  skillPointsEnabled,
  isEditing
}: {
  rows: SkillRow[];
  entity: Entity;
  patchEntity: (patch: Partial<Entity>) => void;
  skillPointsEnabled: boolean;
  isEditing: boolean;
}) {
  return (
    <div className={skillPointsEnabled ? "skill-table skill-table-with-points" : "skill-table"}>
      {skillPointsEnabled && <div className="skill-table-head"><span>Skill</span><span>Base</span><span>Pts</span><span>Final</span></div>}
      {rows.map((skill) => (
        <div key={skill.id}>
          <span>{skill.name}</span>
          {skillPointsEnabled ? (
            <>
              <small>{skill.baseValue}</small>
              {skill.allocatable && isEditing ? (
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={skill.allocatedPoints}
                  onChange={(event) => {
                    const nextPoints = Math.max(0, Math.floor(Number(event.target.value) || 0));
                    patchEntity({
                      skills: {
                        ...entity.skills,
                        skillPointsEnabled: true,
                        allocatedPoints: {
                          ...entity.skills?.allocatedPoints,
                          [skill.id]: nextPoints
                        }
                      }
                    });
                  }}
                />
              ) : (
                <small>{skill.allocatable ? skill.allocatedPoints : "-"}</small>
              )}
              <strong>{skill.finalValue}</strong>
            </>
          ) : (
            <strong>{skill.baseValue}</strong>
          )}
        </div>
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

function SheetInventoryTree({ title, nodes, catalogs, viewMode }: { title: string; nodes: InventoryNode[]; catalogs: Catalogs; viewMode: ViewMode }) {
  return (
    <div className="sheet-inventory-list">
      <h4>{title}</h4>
      {nodes.length === 0 ? <p className="empty-row">-</p> : nodes.map((node) => (
        <SheetInventoryNode key={node.entry.id} node={node} catalogs={catalogs} viewMode={viewMode} depth={0} />
      ))}
    </div>
  );
}

function SheetInventoryNode({
  node,
  catalogs,
  viewMode,
  depth
}: {
  node: InventoryNode;
  catalogs: Catalogs;
  viewMode: ViewMode;
  depth: number;
}) {
  const isContainer = node.item.type === "container";
  const [expanded, setExpanded] = useState(false);
  const slots = entrySlots(node.entry, catalogs);
  const hand = node.entry.handSlot ? ` · ${node.entry.handSlot.replace(/_/g, " ")}` : "";

  return (
    <div className={isContainer ? "sheet-inventory-node container-node" : "sheet-inventory-node"} style={{ "--depth": depth } as React.CSSProperties}>
      <div>
        <button
          className={node.children.length ? "icon-button" : "icon-button muted"}
          onClick={() => setExpanded((value) => !value)}
          disabled={!node.children.length}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <span>{displayName(node.entry, catalogs, viewMode)}</span>
        <small>
          {node.entry.quantity} x {slots} slot{slots === 1 ? "" : "s"}{hand}
          {isContainer && node.capacitySlots !== undefined ? ` · ${node.usedSlots}/${node.capacitySlots}` : ""}
        </small>
      </div>
      {expanded && node.children.length > 0 && (
        <div className="sheet-inventory-children">
          {node.children.map((child) => (
            <SheetInventoryNode key={child.entry.id} node={child} catalogs={catalogs} viewMode={viewMode} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
