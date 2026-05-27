import { create } from "zustand";
import type {
  Campaign,
  Catalogs,
  Entity,
  EntitySummary,
  HandSlot,
  InventoryActionResult,
  InventoryEntry,
  InventoryLocation,
  ItemTemplate,
  ViewMode
} from "../types";
import { catalogs as staticCatalogs } from "../lib/catalogs";
import { collectInventoryDescendantIds, validateInventoryPlacement } from "../lib/inventoryIntegrity";
import { createRepository, type CampaignRepository, type RepositoryKind } from "../lib/repository";
import { createStarterCampaign, createTreasureItem, makeCampaignId, nowIso } from "../lib/seed";
import {
  entryItem,
  displayName,
  handSlotForLocation,
  splitInventoryEntry,
  spendLightTurnPatch,
  summarizeEntity,
  validateHandAssignment
} from "../lib/rules";

type CampaignState = {
  catalogs: Catalogs;
  repositoryKind: RepositoryKind;
  userId: string | null;
  campaignId: string | null;
  campaign: Campaign | null;
  entities: Entity[];
  inventoryEntries: InventoryEntry[];
  viewMode: ViewMode;
  loading: boolean;
  error: string | null;
  initialize: (campaignId?: string) => Promise<void>;
  createCampaign: (name: string) => Promise<string>;
  setViewMode: (mode: ViewMode) => Promise<void>;
  updateEntity: (entity: Entity) => Promise<void>;
  addEntity: (entity: Omit<Entity, "id" | "createdAt" | "updatedAt" | "active" | "sortOrder">) => Promise<void>;
  addCatalogItem: (input: {
    entityId: string;
    itemTemplateId: string;
    quantity: number;
    location: InventoryLocation;
    handSlot?: HandSlot | null;
  }) => Promise<InventoryActionResult>;
  addCustomTreasure: (input: {
    entityId: string;
    name: string;
    description: string;
    gpValue: number | null;
    slotsPerUnit: number;
    quantity: number;
    location: InventoryLocation;
    handSlot?: HandSlot | null;
  }) => Promise<InventoryActionResult>;
  updateInventoryEntry: (entry: InventoryEntry) => Promise<void>;
  moveInventoryEntry: (input: {
    entryId: string;
    entityId: string;
    location: InventoryLocation;
    handSlot?: HandSlot | null;
  }) => Promise<InventoryActionResult>;
  splitEntry: (entryId: string, quantity: number) => Promise<void>;
  toggleLight: (entryId: string) => Promise<void>;
  spendTurn: () => Promise<void>;
  deleteEntry: (entryId: string) => Promise<void>;
  summaries: () => EntitySummary[];
};

let repository: CampaignRepository | null = null;
let unsubscribe: (() => void) | null = null;

export const useCampaignStore = create<CampaignState>((set, get) => ({
  catalogs: staticCatalogs,
  repositoryKind: "local",
  userId: null,
  campaignId: null,
  campaign: null,
  entities: [],
  inventoryEntries: [],
  viewMode: "gm",
  loading: false,
  error: null,

  async initialize(campaignId = "demo-table") {
    if (unsubscribe) unsubscribe();
    repository = createRepository();
    set({ loading: true, error: null, repositoryKind: repository.kind });

    try {
      const userId = await repository.signIn();
      const starter = createStarterCampaign(campaignId);
      await repository.ensureCampaign(starter);
      unsubscribe = repository.subscribeCampaign(campaignId, (snapshot) => {
        const sortedEntities = [...snapshot.entities].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
        set({
          userId,
          campaignId,
          campaign: snapshot.campaign,
          entities: sortedEntities,
          inventoryEntries: snapshot.inventoryEntries,
          viewMode: snapshot.campaign.settings.viewMode,
          loading: false,
          error: null
        });
      });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : "Unable to load campaign." });
    }
  },

  async createCampaign(name) {
    repository ??= createRepository();
    const campaignId = makeCampaignId(name);
    await repository.signIn();
    await repository.ensureCampaign(createStarterCampaign(campaignId, name));
    return campaignId;
  },

  async setViewMode(mode) {
    const { campaign } = get();
    if (!campaign || !repository) return;
    const nextCampaign = {
      ...campaign,
      settings: { ...campaign.settings, viewMode: mode },
      updatedAt: nowIso()
    };
    set({ campaign: nextCampaign, viewMode: mode });
    await repository.saveCampaign(nextCampaign);
  },

  async updateEntity(entity) {
    const { campaignId } = get();
    if (!campaignId || !repository) return;
    const nextEntity = { ...entity, updatedAt: nowIso() };
    set((state) => ({ entities: upsertById(state.entities, nextEntity) }));
    await repository.saveEntity(campaignId, nextEntity);
  },

  async addEntity(entityInput) {
    const { campaignId, campaign, entities } = get();
    if (!campaignId || !campaign || !repository) return;
    const timestamp = nowIso();
    const entity: Entity = {
      ...entityInput,
      id: crypto.randomUUID(),
      active: true,
      sortOrder: entities.length * 10 + 10,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const nextCampaign = { ...campaign, updatedAt: timestamp };
    set((state) => ({ entities: [...state.entities, entity], campaign: nextCampaign }));
    await Promise.all([repository.saveEntity(campaignId, entity), repository.saveCampaign(nextCampaign)]);
  },

  async addCatalogItem({ entityId, itemTemplateId, quantity, location, handSlot = null }) {
    const { campaignId, catalogs, inventoryEntries, viewMode } = get();
    if (!campaignId || !repository) return { ok: false, message: "No campaign is loaded." };
    const placementValidation = validateInventoryPlacement({ entityId, location, entries: inventoryEntries, catalogs });
    if (!placementValidation.ok) return placementValidation;
    const normalizedHandSlot = handSlotForLocation(location, handSlot);
    const validation = validateHandAssignment(entityId, inventoryEntries, normalizedHandSlot);
    if (!validation.ok) return blockedHandResult(validation.blockers, catalogs, viewMode);
    const template = catalogs.itemsById[itemTemplateId];
    const timestamp = nowIso();
    const entry: InventoryEntry = {
      id: crypto.randomUUID(),
      entityId,
      itemTemplateId,
      quantity: Math.max(1, Math.floor(quantity)),
      location,
      handSlot: normalizedHandSlot,
      state: initialStateForTemplate(template),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    set((state) => ({ inventoryEntries: [...state.inventoryEntries, entry] }));
    await repository.saveInventoryEntry(campaignId, entry);
    return { ok: true };
  },

  async addCustomTreasure({ entityId, name, description, gpValue, slotsPerUnit, quantity, location, handSlot = null }) {
    const { campaignId, catalogs, inventoryEntries, viewMode } = get();
    if (!campaignId || !repository) return { ok: false, message: "No campaign is loaded." };
    const placementValidation = validateInventoryPlacement({ entityId, location, entries: inventoryEntries, catalogs });
    if (!placementValidation.ok) return placementValidation;
    const normalizedHandSlot = handSlotForLocation(location, handSlot);
    const validation = validateHandAssignment(entityId, inventoryEntries, normalizedHandSlot);
    if (!validation.ok) return blockedHandResult(validation.blockers, catalogs, viewMode);
    const timestamp = nowIso();
    const item = createTreasureItem(crypto.randomUUID(), name, description, gpValue, slotsPerUnit);
    const entry: InventoryEntry = {
      id: crypto.randomUUID(),
      entityId,
      customItem: item,
      quantity: Math.max(1, Math.floor(quantity)),
      location,
      handSlot: normalizedHandSlot,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    set((state) => ({ inventoryEntries: [...state.inventoryEntries, entry] }));
    await repository.saveInventoryEntry(campaignId, entry);
    return { ok: true };
  },

  async updateInventoryEntry(entry) {
    const { campaignId } = get();
    if (!campaignId || !repository) return;
    const nextEntry = { ...entry, updatedAt: nowIso() };
    set((state) => ({ inventoryEntries: upsertById(state.inventoryEntries, nextEntry) }));
    await repository.saveInventoryEntry(campaignId, nextEntry);
  },

  async moveInventoryEntry({ entryId, entityId, location, handSlot = null }) {
    const { campaignId, inventoryEntries, catalogs, viewMode } = get();
    if (!campaignId || !repository) return { ok: false, message: "No campaign is loaded." };
    const entry = inventoryEntries.find((candidate) => candidate.id === entryId);
    if (!entry) return { ok: false, message: "Item no longer exists." };
    const placementValidation = validateInventoryPlacement({ entryId, entityId, location, entries: inventoryEntries, catalogs });
    if (!placementValidation.ok) return placementValidation;
    const normalizedHandSlot = handSlotForLocation(location, handSlot);
    const validation = validateHandAssignment(entityId, inventoryEntries, normalizedHandSlot, entryId);
    if (!validation.ok) return blockedHandResult(validation.blockers, catalogs, viewMode);
    const timestamp = nowIso();
    const nextEntry: InventoryEntry = {
      ...entry,
      entityId,
      location,
      handSlot: normalizedHandSlot,
      updatedAt: timestamp
    };
    const descendantIds = collectInventoryDescendantIds(entryId, inventoryEntries);
    const movedEntries = inventoryEntries
      .filter((candidate) => descendantIds.has(candidate.id))
      .map((candidate) =>
        candidate.id === nextEntry.id
          ? nextEntry
          : { ...candidate, entityId, handSlot: null, updatedAt: timestamp }
      );
    set((state) => ({ inventoryEntries: state.inventoryEntries.map((candidate) => movedEntries.find((moved) => moved.id === candidate.id) ?? candidate) }));
    await repository.saveInventoryEntries(campaignId, movedEntries);
    return { ok: true };
  },

  async splitEntry(entryId, quantity) {
    const { campaignId, inventoryEntries } = get();
    if (!campaignId || !repository) return;
    const entry = inventoryEntries.find((candidate) => candidate.id === entryId);
    if (!entry || entry.quantity <= 1) return;
    const [original, split] = splitInventoryEntry(entry, quantity);
    const timestamp = nowIso();
    const nextOriginal = { ...original, updatedAt: timestamp };
    const nextSplit = { ...split, handSlot: null, updatedAt: timestamp };
    set((state) => ({ inventoryEntries: [...upsertById(state.inventoryEntries, nextOriginal), nextSplit] }));
    await repository.saveInventoryEntries(campaignId, [nextOriginal, nextSplit]);
  },

  async toggleLight(entryId) {
    const { campaignId, inventoryEntries, catalogs } = get();
    if (!campaignId || !repository) return;
    const entry = inventoryEntries.find((candidate) => candidate.id === entryId);
    if (!entry) return;
    const item = entryItem(entry, catalogs);
    const nextEntry: InventoryEntry = {
      ...entry,
      state: {
        ...initialStateForTemplate(item),
        ...entry.state,
        isLit: !entry.state?.isLit
      },
      updatedAt: nowIso()
    };
    set((state) => ({ inventoryEntries: upsertById(state.inventoryEntries, nextEntry) }));
    await repository.saveInventoryEntry(campaignId, nextEntry);
  },

  async spendTurn() {
    const { campaignId, inventoryEntries, catalogs } = get();
    if (!campaignId || !repository) return;
    const changed = inventoryEntries
      .map((entry) => spendLightTurnPatch(entry, catalogs))
      .filter((entry): entry is InventoryEntry => Boolean(entry))
      .map((entry) => ({ ...entry, updatedAt: nowIso() }));
    if (changed.length === 0) return;
    set((state) => ({ inventoryEntries: state.inventoryEntries.map((entry) => changed.find((next) => next.id === entry.id) ?? entry) }));
    await repository.saveInventoryEntries(campaignId, changed);
  },

  async deleteEntry(entryId) {
    const { campaignId, inventoryEntries } = get();
    if (!campaignId || !repository) return;
    const repo = repository;
    const idsToDelete = collectInventoryDescendantIds(entryId, inventoryEntries);
    set((state) => ({ inventoryEntries: state.inventoryEntries.filter((entry) => !idsToDelete.has(entry.id)) }));
    await Promise.all([...idsToDelete].map((id) => repo.deleteInventoryEntry(campaignId, id)));
  },

  summaries() {
    const { entities, inventoryEntries, catalogs, viewMode } = get();
    return entities
      .filter((entity) => entity.active)
      .map((entity) => summarizeEntity(entity, inventoryEntries, catalogs, viewMode));
  }
}));

function initialStateForTemplate(template: ItemTemplate | undefined): InventoryEntry["state"] | undefined {
  if (!template) return undefined;
  if (!template.emitsLight && !template.gear?.durationTurnsMax) return undefined;
  return {
    isLit: false,
    durationTurnsUsed: template.gear?.durationTurnsUsed ?? 0,
    durationTurnsMax: template.gear?.durationTurnsMax ?? null
  };
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const exists = items.some((candidate) => candidate.id === item.id);
  if (!exists) return [...items, item];
  return items.map((candidate) => (candidate.id === item.id ? item : candidate));
}

function blockedHandResult(entries: InventoryEntry[], catalogs: Catalogs, viewMode: ViewMode): InventoryActionResult {
  const itemNames = entries.map((entry) => displayName(entry, catalogs, viewMode)).join(", ");
  return {
    ok: false,
    message: `That hand is already occupied by ${itemNames}.`
  };
}
