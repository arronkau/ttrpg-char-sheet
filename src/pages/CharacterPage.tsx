import { Save } from "lucide-react";
import { useMemo, useState } from "react";
import { buildInventoryTree, displayName, summarizeEntity } from "../lib/rules";
import { useCampaignStore } from "../store/campaignStore";
import type { Entity } from "../types";

export function CharacterPage() {
  const entities = useCampaignStore((state) => state.entities);
  const inventoryEntries = useCampaignStore((state) => state.inventoryEntries);
  const catalogs = useCampaignStore((state) => state.catalogs);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const updateEntity = useCampaignStore((state) => state.updateEntity);
  const characterEntities = entities.filter((entity) => ["character", "retainer", "hireling"].includes(entity.type));
  const [selectedId, setSelectedId] = useState(characterEntities[0]?.id ?? "");
  const entity = characterEntities.find((candidate) => candidate.id === selectedId) ?? characterEntities[0];
  const summary = entity ? summarizeEntity(entity, inventoryEntries, catalogs, viewMode) : null;
  const tree = useMemo(() => buildInventoryTree(inventoryEntries.filter((entry) => entry.entityId === entity?.id), catalogs), [inventoryEntries, catalogs, entity?.id]);

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

  return (
    <main className="page-grid sheet-layout">
      <section className="panel sheet-main">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Sheet</p>
            <h2>{entity.name}</h2>
          </div>
          <select value={entity.id} onChange={(event) => setSelectedId(event.target.value)}>
            {characterEntities.map((candidate) => (
              <option value={candidate.id} key={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </div>

        <div className="stat-strip">
          <div>
            <span>Level</span>
            <strong>{summary.level ?? "—"}</strong>
          </div>
          <div>
            <span>AC</span>
            <strong>{summary.armorClass ?? "—"}</strong>
          </div>
          <div>
            <span>Move</span>
            <strong>{summary.movementExploration}/{summary.movementEncounter}</strong>
          </div>
          <div>
            <span>Load</span>
            <strong>{summary.carriedSlots}</strong>
          </div>
        </div>

        <div className="sheet-form">
          <label>
            Name
            <input value={entity.name} onChange={(event) => patchEntity({ name: event.target.value })} />
          </label>
          <label>
            Class
            <select value={entity.classId ?? ""} onChange={(event) => patchEntity({ classId: event.target.value })}>
              <option value="">None</option>
              {catalogs.classes.map((classDef) => (
                <option value={classDef.id} key={classDef.id}>
                  {classDef.class_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            XP
            <input type="number" value={entity.xp ?? 0} onChange={(event) => patchEntity({ xp: Number(event.target.value) })} />
          </label>
          <div className="inline-fields">
            <label>
              HP
              <input
                type="number"
                value={entity.hp?.currentHp ?? 0}
                onChange={(event) => patchEntity({ hp: { currentHp: Number(event.target.value), maxHp: entity.hp?.maxHp ?? 1 } })}
              />
            </label>
            <label>
              Max
              <input
                type="number"
                value={entity.hp?.maxHp ?? 1}
                onChange={(event) => patchEntity({ hp: { currentHp: entity.hp?.currentHp ?? 1, maxHp: Number(event.target.value) } })}
              />
            </label>
          </div>
          <AbilityGrid entity={entity} patchEntity={patchEntity} />
          <label className="wide-field">
            Public notes
            <textarea
              value={entity.notes?.publicNotes ?? ""}
              onChange={(event) => patchEntity({ notes: { ...entity.notes, publicNotes: event.target.value } })}
            />
          </label>
          {viewMode === "gm" && (
            <label className="wide-field">
              Referee notes
              <textarea
                value={entity.notes?.refereeNotes ?? ""}
                onChange={(event) => patchEntity({ notes: { ...entity.notes, refereeNotes: event.target.value } })}
              />
            </label>
          )}
        </div>
      </section>

      <aside className="panel">
        <div className="section-heading">
          <h2>Derived</h2>
          <Save size={17} />
        </div>
        <div className="derived-list">
          <div><span>Next XP</span><strong>{summary.xpForNextLevel ?? "Max"}</strong></div>
          <div><span>Attack</span><strong>{summary.attackModifier ?? 0}</strong></div>
          <div><span>Encumbrance</span><strong>{summary.encumbranceLabel}</strong></div>
        </div>
        <h3>Saving Throws</h3>
        <div className="save-grid">
          {Object.entries(summary.savingThrows ?? {}).map(([key, value]) => (
            <div key={key}>
              <span>{key.replace(/_/g, " ")}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <h3>Inventory</h3>
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

function AbilityGrid({ entity, patchEntity }: { entity: Entity; patchEntity: (patch: Partial<Entity>) => void }) {
  const abilities = entity.abilities ?? {
    strength: 10,
    intelligence: 10,
    wisdom: 10,
    dexterity: 10,
    constitution: 10,
    charisma: 10
  };

  return (
    <div className="ability-grid">
      {Object.entries(abilities).map(([ability, score]) => (
        <label key={ability}>
          {ability.slice(0, 3).toUpperCase()}
          <input
            type="number"
            min={3}
            max={18}
            value={score}
            onChange={(event) =>
              patchEntity({ abilities: { ...abilities, [ability]: Number(event.target.value) } })
            }
          />
        </label>
      ))}
    </div>
  );
}
