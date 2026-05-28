import { NavLink, Route, Routes, useParams } from "react-router-dom";
import { BookOpen, Boxes, ClipboardList, Database, EyeOff, FileText, Plus, Shield, Sparkles, Undo2, Users, X } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useCampaignStore } from "./store/campaignStore";
import { PartyPage } from "./pages/PartyPage";
import { summarizeEntity } from "./lib/rules";
import type { AbilityScores, Entity, EntityType } from "./types";

const InventoryPage = lazy(() => import("./pages/InventoryPage").then((module) => ({ default: module.InventoryPage })));
const CharacterPage = lazy(() => import("./pages/CharacterPage").then((module) => ({ default: module.CharacterPage })));
const ItemsPage = lazy(() => import("./pages/ItemsPage").then((module) => ({ default: module.ItemsPage })));
const SpellsPage = lazy(() => import("./pages/SpellsPage").then((module) => ({ default: module.SpellsPage })));

export default function CampaignShell() {
  const { campaignId } = useParams();
  const initialize = useCampaignStore((state) => state.initialize);
  const loading = useCampaignStore((state) => state.loading);
  const error = useCampaignStore((state) => state.error);
  const campaign = useCampaignStore((state) => state.campaign);
  const entities = useCampaignStore((state) => state.entities);
  const inventoryEntries = useCampaignStore((state) => state.inventoryEntries);
  const catalogs = useCampaignStore((state) => state.catalogs);
  const repositoryKind = useCampaignStore((state) => state.repositoryKind);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const setViewMode = useCampaignStore((state) => state.setViewMode);
  const [entityManagerOpen, setEntityManagerOpen] = useState(false);
  const warningCount = useMemo(
    () =>
      entities
        .filter((entity) => entity.active)
        .map((entity) => summarizeEntity(entity, inventoryEntries, catalogs, viewMode))
        .reduce((total, summary) => total + summary.warnings.length, 0),
    [entities, inventoryEntries, catalogs, viewMode]
  );

  useEffect(() => {
    void initialize(campaignId || "demo-table");
  }, [campaignId, initialize]);

  if (loading && !campaign) {
    return <LoadingShell label="Loading campaign" />;
  }

  if (error) {
    return (
      <main className="loading-shell">
        <p>{error}</p>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{repositoryKind === "firestore" ? "Firestore sync" : "Local demo"}</p>
          <h1>{campaign?.name ?? "Table Kit"}</h1>
        </div>
        <div className="topbar-actions">
          <button className="toggle" onClick={() => setEntityManagerOpen(true)} title="Manage entities">
            <Users size={17} />
            Entities
          </button>
          <button
            className={viewMode === "gm" ? "toggle active" : "toggle"}
            onClick={() => void setViewMode(viewMode === "gm" ? "player" : "gm")}
            title="Switch GM/player view"
          >
            <Database size={17} />
            {viewMode.toUpperCase()}
          </button>
          <span className={warningCount > 0 ? "warning-pill" : "quiet-pill"}>{warningCount} warnings</span>
        </div>
      </header>
      {entityManagerOpen && <EntityManagerModal onClose={() => setEntityManagerOpen(false)} />}
      <nav className="main-nav">
        <NavLink to={`/campaign/${campaignId}/party`}>
          <ClipboardList size={18} />
          Party
        </NavLink>
        <NavLink to={`/campaign/${campaignId}/inventory`}>
          <Boxes size={18} />
          Inventory
        </NavLink>
        <NavLink to={`/campaign/${campaignId}/sheet`}>
          <FileText size={18} />
          Sheet
        </NavLink>
        <NavLink to={`/campaign/${campaignId}/items`}>
          <BookOpen size={18} />
          Items
        </NavLink>
        <NavLink to={`/campaign/${campaignId}/spells`}>
          <Sparkles size={18} />
          Spells
        </NavLink>
      </nav>
      <Suspense fallback={<LoadingShell label="Loading page" />}>
        <Routes>
          <Route path="/" element={<PartyPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="party" element={<PartyPage />} />
          <Route path="sheet" element={<CharacterPage />} />
          <Route path="items" element={<ItemsPage />} />
          <Route path="spells" element={<SpellsPage />} />
        </Routes>
      </Suspense>
    </div>
  );
}

function LoadingShell({ label }: { label: string }) {
  return (
    <main className="loading-shell">
      <Shield size={26} />
      <p>{label}</p>
    </main>
  );
}

const entityTypeOptions: EntityType[] = ["character", "retainer", "hireling", "mount", "vehicle", "storage"];
const detailedEntityTypes = new Set<EntityType>(["character", "retainer", "hireling"]);
const attachedEntityTypes = new Set<EntityType>(["retainer", "hireling"]);
const capacityEntityTypes = new Set<EntityType>(["mount", "vehicle", "storage"]);
const movementEntityTypes = new Set<EntityType>(["mount", "vehicle"]);

type EntityDraft = {
  type: EntityType;
  name: string;
  attachedToEntityId: string;
  gpPerDay: string;
  treasureSharePercent: string;
  capacitySlots: string;
  movementExploration: string;
  movementEncounter: string;
  playerName: string;
  classId: string;
  xp: string;
  alignment: string;
  languages: string;
  currentHp: string;
  maxHp: string;
  abilities: AbilityScores;
  publicNotes: string;
  refereeNotes: string;
};

type EntityInput = Omit<Entity, "id" | "createdAt" | "updatedAt" | "active" | "sortOrder">;

function EntityManagerModal({ onClose }: { onClose: () => void }) {
  const entities = useCampaignStore((state) => state.entities);
  const catalogs = useCampaignStore((state) => state.catalogs);
  const viewMode = useCampaignStore((state) => state.viewMode);
  const addEntity = useCampaignStore((state) => state.addEntity);
  const updateEntity = useCampaignStore((state) => state.updateEntity);
  const retireEntity = useCampaignStore((state) => state.retireEntity);
  const restoreEntity = useCampaignStore((state) => state.restoreEntity);
  const [selectedId, setSelectedId] = useState("new");
  const [draft, setDraft] = useState<EntityDraft>(() => defaultEntityDraft("character"));
  const sortedEntities = useMemo(
    () => [...entities].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [entities]
  );
  const activeEntities = sortedEntities.filter((entity) => entity.active);
  const retiredEntities = sortedEntities.filter((entity) => !entity.active);
  const attachableCharacters = activeEntities.filter((entity) => entity.type === "character");
  const selectedEntity = selectedId === "new" ? null : entities.find((entity) => entity.id === selectedId) ?? null;
  const usesDetailedFields = detailedEntityTypes.has(draft.type);
  const usesAttachmentFields = attachedEntityTypes.has(draft.type);
  const usesCapacityFields = capacityEntityTypes.has(draft.type);
  const usesMovementFields = movementEntityTypes.has(draft.type);

  const selectEntity = (entity: Entity) => {
    setSelectedId(entity.id);
    setDraft(draftFromEntity(entity));
  };

  const startNewEntity = (type: EntityType = "character") => {
    setSelectedId("new");
    setDraft(defaultEntityDraft(type));
  };

  const patchDraft = (patch: Partial<EntityDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const patchAbility = (ability: keyof AbilityScores, value: string) => {
    setDraft((current) => ({
      ...current,
      abilities: { ...current.abilities, [ability]: finiteInteger(value, 10) }
    }));
  };

  const saveEntity = async () => {
    const entityInput = entityInputFromDraft(draft, selectedEntity);
    if (selectedEntity) {
      await updateEntity({
        ...entityInput,
        id: selectedEntity.id,
        active: selectedEntity.active,
        sortOrder: selectedEntity.sortOrder,
        createdAt: selectedEntity.createdAt,
        updatedAt: selectedEntity.updatedAt
      });
      return;
    }

    await addEntity(entityInput);
    startNewEntity(draft.type);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-panel entity-modal" role="dialog" aria-modal="true" aria-label="Manage entities">
        <header>
          <div>
            <p className="eyebrow">Campaign</p>
            <h2>Manage Entities</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </header>

        <div className="entity-manager-grid">
          <aside className="entity-manager-list">
            <button className={selectedId === "new" ? "primary-action full-width" : "full-width"} onClick={() => startNewEntity()}>
              <Plus size={15} />
              New Entity
            </button>
            <EntityListSection title="Active" entities={activeEntities} selectedId={selectedId} onSelect={selectEntity} />
            <EntityListSection
              title="Retired"
              entities={retiredEntities}
              selectedId={selectedId}
              onSelect={selectEntity}
              onRestore={(entityId) => void restoreEntity(entityId)}
            />
          </aside>

          <div className="entity-editor">
            <div className="form-grid">
              <div className="inline-fields">
                <label>
                  Name
                  <input value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} autoFocus />
                </label>
                <label>
                  Type
                  <select value={draft.type} onChange={(event) => patchDraft({ type: event.target.value as EntityType })}>
                    {entityTypeOptions.map((type) => (
                      <option value={type} key={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {usesAttachmentFields && (
                <div className="inline-fields">
                  <label>
                    Attached to
                    <select value={draft.attachedToEntityId} onChange={(event) => patchDraft({ attachedToEntityId: event.target.value })}>
                      <option value="">None</option>
                      {attachableCharacters.map((entity) => (
                        <option value={entity.id} key={entity.id}>
                          {entity.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    GP/day
                    <input type="text" inputMode="numeric" pattern="[0-9]*" min={0} value={draft.gpPerDay} onChange={(event) => patchDraft({ gpPerDay: event.target.value })} />
                  </label>
                  <label>
                    Treasure %
                    <input
                      type="text" inputMode="numeric" pattern="[0-9]*"
                      min={0}
                      max={100}
                      value={draft.treasureSharePercent}
                      onChange={(event) => patchDraft({ treasureSharePercent: event.target.value })}
                    />
                  </label>
                </div>
              )}

              {usesCapacityFields && (
                <div className={usesMovementFields ? "inline-fields three-fields" : "inline-fields"}>
                  <label>
                    Capacity
                    <input type="text" inputMode="numeric" pattern="[0-9]*" min={0} value={draft.capacitySlots} onChange={(event) => patchDraft({ capacitySlots: event.target.value })} />
                  </label>
                  {usesMovementFields && (
                    <>
                      <label>
                        Move
                        <input
                          type="text" inputMode="numeric" pattern="[0-9]*"
                          min={0}
                          value={draft.movementExploration}
                          onChange={(event) => patchDraft({ movementExploration: event.target.value })}
                        />
                      </label>
                      <label>
                        Encounter
                        <input
                          type="text" inputMode="numeric" pattern="[0-9]*"
                          min={0}
                          value={draft.movementEncounter}
                          onChange={(event) => patchDraft({ movementEncounter: event.target.value })}
                        />
                      </label>
                    </>
                  )}
                </div>
              )}

              {usesDetailedFields && (
                <>
                  <div className="inline-fields three-fields">
                    <label>
                      Player
                      <input value={draft.playerName} onChange={(event) => patchDraft({ playerName: event.target.value })} />
                    </label>
                    <label>
                      Class
                      <select value={draft.classId} onChange={(event) => patchDraft({ classId: event.target.value })}>
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
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={draft.xp} onChange={(event) => patchDraft({ xp: event.target.value })} />
                    </label>
                  </div>

                  <div className="inline-fields three-fields">
                    <label>
                      Alignment
                      <input value={draft.alignment} onChange={(event) => patchDraft({ alignment: event.target.value })} />
                    </label>
                    <label>
                      HP
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={draft.currentHp} onChange={(event) => patchDraft({ currentHp: event.target.value })} />
                    </label>
                    <label>
                      Max
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={draft.maxHp} onChange={(event) => patchDraft({ maxHp: event.target.value })} />
                    </label>
                  </div>

                  <label>
                    Languages
                    <input value={draft.languages} onChange={(event) => patchDraft({ languages: event.target.value })} />
                  </label>

                  <div className="ability-grid">
                    {Object.entries(draft.abilities).map(([ability, score]) => (
                      <label key={ability}>
                        {ability.slice(0, 3).toUpperCase()}
                        <input
                          type="text" inputMode="numeric" pattern="[0-9]*"
                          min={3}
                          max={18}
                          value={score}
                          onChange={(event) => patchAbility(ability as keyof AbilityScores, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </>
              )}

              <label>
                Public notes
                <textarea value={draft.publicNotes} onChange={(event) => patchDraft({ publicNotes: event.target.value })} />
              </label>
              {viewMode === "gm" && (
                <label>
                  Referee notes
                  <textarea value={draft.refereeNotes} onChange={(event) => patchDraft({ refereeNotes: event.target.value })} />
                </label>
              )}
            </div>

            <footer className="entity-editor-actions">
              <div>
                {selectedEntity?.active && (
                  <button className="danger-action" onClick={() => void retireEntity(selectedEntity.id)}>
                    <EyeOff size={16} />
                    Retire
                  </button>
                )}
                {selectedEntity && !selectedEntity.active && (
                  <button onClick={() => void restoreEntity(selectedEntity.id)}>
                    <Undo2 size={16} />
                    Restore
                  </button>
                )}
              </div>
              <button className="primary-action" onClick={() => void saveEntity()}>
                <Plus size={17} />
                {selectedEntity ? "Save" : "Add"}
              </button>
            </footer>
          </div>
        </div>
      </section>
    </div>
  );
}

function EntityListSection({
  title,
  entities,
  selectedId,
  onSelect,
  onRestore
}: {
  title: string;
  entities: Entity[];
  selectedId: string;
  onSelect: (entity: Entity) => void;
  onRestore?: (entityId: string) => void;
}) {
  return (
    <section className="entity-list-section">
      <h3>{title}</h3>
      {entities.length ? (
        entities.map((entity) => (
          <div className={selectedId === entity.id ? "entity-list-row selected" : "entity-list-row"} key={entity.id}>
            <button onClick={() => onSelect(entity)}>
              <strong>{entity.name}</strong>
              <span>{entity.type}</span>
            </button>
            {onRestore && (
              <button className="icon-button" onClick={() => onRestore(entity.id)} title="Restore">
                <Undo2 size={14} />
              </button>
            )}
          </div>
        ))
      ) : (
        <p className="empty-row">None</p>
      )}
    </section>
  );
}

function defaultEntityDraft(type: EntityType): EntityDraft {
  return {
    type,
    name: "",
    attachedToEntityId: "",
    gpPerDay: "0",
    treasureSharePercent: "0",
    capacitySlots: "0",
    movementExploration: "0",
    movementEncounter: "0",
    playerName: "",
    classId: "",
    xp: "0",
    alignment: "",
    languages: "",
    currentHp: "1",
    maxHp: "1",
    abilities: defaultAbilities(),
    publicNotes: "",
    refereeNotes: ""
  };
}

function draftFromEntity(entity: Entity): EntityDraft {
  return {
    type: entity.type,
    name: entity.name,
    attachedToEntityId: entity.logistics?.attachedToEntityId ?? "",
    gpPerDay: String(entity.logistics?.gpPerDay ?? legacyPayRateGp(entity) ?? 0),
    treasureSharePercent: String(entity.logistics?.treasureSharePercent ?? 0),
    capacitySlots: String(entity.logistics?.capacitySlots ?? 0),
    movementExploration: String(entity.logistics?.movementExploration ?? 0),
    movementEncounter: String(entity.logistics?.movementEncounter ?? 0),
    playerName: entity.playerName ?? "",
    classId: entity.classId ?? "",
    xp: String(entity.xp ?? 0),
    alignment: entity.alignment ?? "",
    languages: entity.languages?.join(", ") ?? "",
    currentHp: String(entity.hp?.currentHp ?? 1),
    maxHp: String(entity.hp?.maxHp ?? 1),
    abilities: entity.abilities ?? defaultAbilities(),
    publicNotes: entity.notes?.publicNotes ?? "",
    refereeNotes: entity.notes?.refereeNotes ?? ""
  };
}

function entityInputFromDraft(draft: EntityDraft, existing: Entity | null): EntityInput {
  const input: EntityInput = {
    type: draft.type,
    name: normalizedEntityName(draft.name, draft.type)
  };
  if (existing?.raceId !== undefined) input.raceId = existing.raceId;
  if (existing?.combatState) input.combatState = existing.combatState;
  if (existing?.spellcasting) input.spellcasting = existing.spellcasting;
  if (existing?.skills) input.skills = existing.skills;

  const logistics = entityLogisticsFromDraft(draft);
  if (Object.keys(logistics).length > 0) input.logistics = logistics;

  const notes = {
    ...(existing?.notes?.privateNotes ? { privateNotes: existing.notes.privateNotes } : {}),
    ...(draft.publicNotes.trim() ? { publicNotes: draft.publicNotes.trim() } : {}),
    ...(draft.refereeNotes.trim() ? { refereeNotes: draft.refereeNotes.trim() } : {})
  };
  if (Object.keys(notes).length > 0) input.notes = notes;

  if (detailedEntityTypes.has(draft.type)) {
    const languages = normalizeLanguages(draft.languages);
    input.abilities = draft.abilities;
    input.hp = {
      currentHp: finiteInteger(draft.currentHp, 1),
      maxHp: finiteInteger(draft.maxHp, 1)
    };
    input.xp = finiteInteger(draft.xp, 0);
    if (draft.playerName.trim()) input.playerName = draft.playerName.trim();
    if (draft.classId) input.classId = draft.classId;
    if (draft.alignment.trim()) input.alignment = draft.alignment.trim();
    if (languages.length > 0) input.languages = languages;
  }

  return input;
}

function entityLogisticsFromDraft(draft: EntityDraft): NonNullable<Entity["logistics"]> {
  const logistics: NonNullable<Entity["logistics"]> = {};

  if (attachedEntityTypes.has(draft.type)) {
    logistics.attachedToEntityId = draft.attachedToEntityId || null;
    logistics.gpPerDay = finiteInteger(draft.gpPerDay, 0);
    logistics.treasureSharePercent = clamp(finiteInteger(draft.treasureSharePercent, 0), 0, 100);
  }

  if (capacityEntityTypes.has(draft.type)) {
    logistics.capacitySlots = finiteInteger(draft.capacitySlots, 0);
  }

  if (movementEntityTypes.has(draft.type)) {
    logistics.movementExploration = finiteInteger(draft.movementExploration, 0);
    logistics.movementEncounter = finiteInteger(draft.movementEncounter, 0);
  }

  return logistics;
}

function normalizedEntityName(name: string, type: EntityType): string {
  const trimmed = name.trim();
  if (trimmed) return trimmed;
  return `New ${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

function normalizeLanguages(value: string): string[] {
  return value
    .split(",")
    .map((language) => language.trim())
    .filter(Boolean);
}

function finiteInteger(value: string, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.floor(numberValue) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function legacyPayRateGp(entity: Entity): number | null {
  const logistics = entity.logistics as Entity["logistics"] & { payRateGp?: number | null } | undefined;
  return logistics?.payRateGp ?? null;
}

function defaultAbilities(): AbilityScores {
  return {
    strength: 10,
    intelligence: 10,
    wisdom: 10,
    dexterity: 10,
    constitution: 10,
    charisma: 10
  };
}
