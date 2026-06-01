import { create } from "zustand";
import type {
  Campaign,
  Catalogs,
  CoinBreakdown,
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
import { collectInventoryDescendantIds, isInventoryLocation, validateInventoryPlacement } from "../lib/inventoryIntegrity";
import { createRepository, type CampaignRepository, type RepositoryKind } from "../lib/repository";
import { createStarterCampaign, createTreasureItem, makeCampaignId, nowIso } from "../lib/seed";
import { inventoryRecordTypeForItem, withInventoryRecordType } from "../lib/inventoryRecordTypes";
import {
  coinTotal,
  displayName,
  entryItem,
  handSlotForLocation,
  isCoinEntry,
  isCoinPurseEntry,
  normalizeCoins,
  splitInventoryEntry,
  spendLightTurn,
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
  retireEntity: (entityId: string) => Promise<void>;
  restoreEntity: (entityId: string) => Promise<void>;
  addCatalogItem: (input: {
    entityId: string;
    itemTemplateId: string;
    quantity: number;
    location: InventoryLocation;
    handSlot?: HandSlot | null;
  }) => Promise<InventoryActionResult>;
  addCustomItem: (input: {
    entityId: string;
    item: ItemTemplate;
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
  updateInventoryItem: (input: {
    entryId: string;
    entityId: string;
    item: ItemTemplate;
    quantity: number;
    location: InventoryLocation;
    handSlot?: HandSlot | null;
  }) => Promise<InventoryActionResult>;
  updateInventoryEntry: (entry: InventoryEntry) => Promise<void>;
  upsertCoinPurseCoins: (input: {
    entityId: string;
    purseEntryId: string;
    coins: CoinBreakdown;
  }) => Promise<InventoryActionResult>;
  moveInventoryEntry: (input: {
    entryId: string;
    entityId: string;
    location: InventoryLocation;
    handSlot?: HandSlot | null;
    sortOrder?: number;
  }) => Promise<InventoryActionResult>;
  swapInventoryOrder: (
    a: { entryId: string; sortOrder: number },
    b: { entryId: string; sortOrder: number }
  ) => Promise<InventoryActionResult>;
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
    repository = await createRepository();
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
    repository ??= await createRepository();
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

  async retireEntity(entityId) {
    const entity = get().entities.find((candidate) => candidate.id === entityId);
    if (!entity || !entity.active) return;
    await get().updateEntity({ ...entity, active: false });
  },

  async restoreEntity(entityId) {
    const entity = get().entities.find((candidate) => candidate.id === entityId);
    if (!entity || entity.active) return;
    await get().updateEntity({ ...entity, active: true });
  },

  async addCatalogItem({ entityId, itemTemplateId, quantity, location, handSlot = null }) {
    const { campaignId, catalogs, inventoryEntries, viewMode } = get();
    if (!campaignId || !repository) return { ok: false, message: "No campaign is loaded." };
    const template = catalogs.itemsById[itemTemplateId];
    const placementValidation = validateInventoryPlacement({ entityId, location, entries: inventoryEntries, catalogs, childItem: template });
    if (!placementValidation.ok) return placementValidation;
    const normalizedHandSlot = handSlotForLocation(location, handSlot);
    const sortOrder = nextInventorySortOrder(inventoryEntries, entityId, location, normalizedHandSlot);
    const validation = validateHandAssignment(entityId, inventoryEntries, normalizedHandSlot);
    if (!validation.ok) return blockedHandResult(validation.blockers, catalogs, viewMode, normalizedHandSlot);
    const timestamp = nowIso();
    const normalizedQuantity = normalizeQuantity(quantity);
    const state = initialStateForTemplate(template);
    if (normalizedHandSlot && shouldSplitQuantityForHandUse(normalizedQuantity, template, normalizedHandSlot)) {
      const entries = createNewHeldUnitSplit({
        entityId,
        itemTemplateId,
        recordType: template ? inventoryRecordTypeForItem(template) : undefined,
        quantity: normalizedQuantity,
        location,
        handSlot: normalizedHandSlot,
        carriedSortOrder: sortOrder,
        heldSortOrder: sortOrder + 10,
        state,
        timestamp
      });
      set((state) => ({ inventoryEntries: [...state.inventoryEntries, ...entries] }));
      await repository.saveInventoryEntries(campaignId, entries);
      return { ok: true };
    }
    const entry: InventoryEntry = {
      id: crypto.randomUUID(),
      recordType: template ? inventoryRecordTypeForItem(template) : undefined,
      entityId,
      itemTemplateId,
      quantity: normalizedQuantity,
      location,
      handSlot: normalizedHandSlot,
      sortOrder,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    if (state) entry.state = state;
    set((state) => ({ inventoryEntries: [...state.inventoryEntries, entry] }));
    await repository.saveInventoryEntry(campaignId, entry);
    return { ok: true };
  },

  async addCustomItem({ entityId, item, quantity, location, handSlot = null }) {
    const { campaignId, catalogs, inventoryEntries, viewMode } = get();
    if (!campaignId || !repository) return { ok: false, message: "No campaign is loaded." };
    const customItem = normalizeCustomItem(item, crypto.randomUUID());
    const placementValidation = validateInventoryPlacement({ entityId, location, entries: inventoryEntries, catalogs, childItem: customItem });
    if (!placementValidation.ok) return placementValidation;
    const normalizedHandSlot = handSlotForLocation(location, handSlot);
    const sortOrder = nextInventorySortOrder(inventoryEntries, entityId, location, normalizedHandSlot);
    const validation = validateHandAssignment(entityId, inventoryEntries, normalizedHandSlot);
    if (!validation.ok) return blockedHandResult(validation.blockers, catalogs, viewMode, normalizedHandSlot);
    const timestamp = nowIso();
    const normalizedQuantity = normalizeQuantity(quantity);
    const state = initialStateForTemplate(customItem);
    if (normalizedHandSlot && shouldSplitQuantityForHandUse(normalizedQuantity, customItem, normalizedHandSlot)) {
      const entries = createNewHeldUnitSplit({
        entityId,
        customItem,
        recordType: inventoryRecordTypeForItem(customItem),
        quantity: normalizedQuantity,
        location,
        handSlot: normalizedHandSlot,
        carriedSortOrder: sortOrder,
        heldSortOrder: sortOrder + 10,
        state,
        timestamp
      });
      set((state) => ({ inventoryEntries: [...state.inventoryEntries, ...entries] }));
      await repository.saveInventoryEntries(campaignId, entries);
      return { ok: true };
    }
    const entry: InventoryEntry = {
      id: crypto.randomUUID(),
      recordType: inventoryRecordTypeForItem(customItem),
      entityId,
      customItem,
      quantity: normalizedQuantity,
      location,
      handSlot: normalizedHandSlot,
      sortOrder,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    if (state) entry.state = state;
    set((state) => ({ inventoryEntries: [...state.inventoryEntries, entry] }));
    await repository.saveInventoryEntry(campaignId, entry);
    return { ok: true };
  },

  async addCustomTreasure({ entityId, name, description, gpValue, slotsPerUnit, quantity, location, handSlot = null }) {
    const { campaignId, catalogs, inventoryEntries, viewMode } = get();
    if (!campaignId || !repository) return { ok: false, message: "No campaign is loaded." };
    const item = createTreasureItem(crypto.randomUUID(), name, description, gpValue, slotsPerUnit);
    const placementValidation = validateInventoryPlacement({ entityId, location, entries: inventoryEntries, catalogs, childItem: item });
    if (!placementValidation.ok) return placementValidation;
    const normalizedHandSlot = handSlotForLocation(location, handSlot);
    const validation = validateHandAssignment(entityId, inventoryEntries, normalizedHandSlot);
    if (!validation.ok) return blockedHandResult(validation.blockers, catalogs, viewMode, normalizedHandSlot);
    const timestamp = nowIso();
    const entry: InventoryEntry = {
      id: crypto.randomUUID(),
      recordType: inventoryRecordTypeForItem(item),
      entityId,
      customItem: item,
      quantity: Math.max(1, Math.floor(quantity)),
      location,
      handSlot: normalizedHandSlot,
      sortOrder: nextInventorySortOrder(inventoryEntries, entityId, location, normalizedHandSlot),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    set((state) => ({ inventoryEntries: [...state.inventoryEntries, entry] }));
    await repository.saveInventoryEntry(campaignId, entry);
    return { ok: true };
  },

  async updateInventoryItem({ entryId, entityId, item, quantity, location, handSlot = null }) {
    const { campaignId, catalogs, inventoryEntries, viewMode } = get();
    if (!campaignId || !repository) return { ok: false, message: "No campaign is loaded." };
    const entry = inventoryEntries.find((candidate) => candidate.id === entryId);
    if (!entry) return { ok: false, message: "Item no longer exists." };
    const descendantIds = collectInventoryDescendantIds(entryId, inventoryEntries);
    if (item.type !== "container" && descendantIds.size > 1) {
      return { ok: false, message: "Move this container's contents out before changing it to another item type." };
    }
    const normalizedHandSlot = handSlotForLocation(location, handSlot);
    const validation = validateHandAssignment(entityId, inventoryEntries, normalizedHandSlot, entryId);
    if (!validation.ok) return blockedHandResult(validation.blockers, catalogs, viewMode, normalizedHandSlot);
    const timestamp = nowIso();
    const customItem = normalizeCustomItem(item, entry.customItem?.id ?? crypto.randomUUID());
    const placementValidation = validateInventoryPlacement({ entryId, entityId, location, entries: inventoryEntries, catalogs, childItem: customItem });
    if (!placementValidation.ok) return placementValidation;
    const { itemTemplateId: _itemTemplateId, ...entryWithoutTemplate } = entry;
    const nextState = stateForItemUpdate(customItem, entry.state);
    const normalizedQuantity = normalizeQuantity(quantity);
    const destinationChanged =
      entry.entityId !== entityId ||
      !sameInventoryLocation(entry.location, location) ||
      (entry.handSlot ?? null) !== normalizedHandSlot;
    const nextSortOrder = destinationChanged
      ? nextInventorySortOrder(inventoryEntries, entityId, location, normalizedHandSlot, descendantIds)
      : entry.sortOrder;
    if (shouldSplitQuantityForHandUse(normalizedQuantity, customItem, normalizedHandSlot)) {
      const nextOriginal: InventoryEntry = {
        ...entryWithoutTemplate,
        recordType: inventoryRecordTypeForItem(customItem),
        customItem,
        quantity: normalizedQuantity - 1,
        handSlot: null,
        updatedAt: timestamp
      };
      if (nextState) nextOriginal.state = { ...nextState, isLit: false };
      const nextSplit: InventoryEntry = {
        ...entryWithoutTemplate,
        id: crypto.randomUUID(),
        recordType: inventoryRecordTypeForItem(customItem),
        entityId,
        customItem,
        quantity: 1,
        location,
        handSlot: normalizedHandSlot,
        sortOrder: nextInventorySortOrder(inventoryEntries, entityId, location, normalizedHandSlot, descendantIds),
        createdAt: timestamp,
        updatedAt: timestamp
      };
      if (nextState) nextSplit.state = nextState;
      set((state) => ({ inventoryEntries: [...upsertById(state.inventoryEntries, nextOriginal), nextSplit] }));
      await repository.saveInventoryEntries(campaignId, [nextOriginal, nextSplit]);
      return { ok: true };
    }
    const nextEntry: InventoryEntry = {
      ...entryWithoutTemplate,
      recordType: inventoryRecordTypeForItem(customItem),
      entityId,
      customItem,
      quantity: normalizedQuantity,
      location,
      handSlot: normalizedHandSlot,
      sortOrder: nextSortOrder,
      updatedAt: timestamp
    };
    if (nextState) nextEntry.state = nextState;
    const changedEntries = inventoryEntries
      .filter((candidate) => descendantIds.has(candidate.id))
      .map((candidate) =>
        candidate.id === nextEntry.id
          ? nextEntry
          : { ...candidate, entityId, handSlot: null, updatedAt: timestamp }
      );
    set((state) => ({
      inventoryEntries: state.inventoryEntries.map((candidate) => changedEntries.find((changed) => changed.id === candidate.id) ?? candidate)
    }));
    await repository.saveInventoryEntries(campaignId, changedEntries);
    return { ok: true };
  },

  async updateInventoryEntry(entry) {
    const { campaignId } = get();
    if (!campaignId || !repository) return;
    const nextEntry = { ...entry, updatedAt: nowIso() };
    set((state) => ({ inventoryEntries: upsertById(state.inventoryEntries, nextEntry) }));
    await repository.saveInventoryEntry(campaignId, nextEntry);
  },

  async upsertCoinPurseCoins({ entityId, purseEntryId, coins }) {
    const { campaignId, catalogs, inventoryEntries } = get();
    if (!campaignId || !repository) return { ok: false, message: "No campaign is loaded." };
    const repo = repository;
    const purse = inventoryEntries.find((entry) => entry.id === purseEntryId);
    if (!purse || purse.entityId !== entityId || !isCoinPurseEntry(purse, catalogs)) {
      return { ok: false, message: "Choose a valid coin purse." };
    }

    const normalizedCoins = normalizeCoins(coins);
    const totalCoins = coinTotal(normalizedCoins);
    const timestamp = nowIso();
    const coinEntries = directChildrenOf(purseEntryId, inventoryEntries).filter((entry) => isCoinEntry(entry, catalogs));
    const [primaryCoinEntry, ...duplicateCoinEntries] = coinEntries;
    const idsToDelete = new Set<string>();
    duplicateCoinEntries.forEach((entry) => collectInventoryDescendantIds(entry.id, inventoryEntries).forEach((id) => idsToDelete.add(id)));

    if (totalCoins === 0) {
      coinEntries.forEach((entry) => collectInventoryDescendantIds(entry.id, inventoryEntries).forEach((id) => idsToDelete.add(id)));
      if (idsToDelete.size === 0) return { ok: true };
      set((state) => ({ inventoryEntries: state.inventoryEntries.filter((entry) => !idsToDelete.has(entry.id)) }));
      await Promise.all([...idsToDelete].map((id) => repo.deleteInventoryEntry(campaignId, id)));
      return { ok: true };
    }

    const coinEntry: InventoryEntry = {
      id: primaryCoinEntry?.id ?? crypto.randomUUID(),
      recordType: "coins",
      entityId,
      customItem: createTreasureItem(primaryCoinEntry?.customItem?.id ?? crypto.randomUUID(), "Coins", "Coins in this purse.", null, 1),
      quantity: totalCoins,
      location: { kind: "contained", parentEntryId: purseEntryId },
      handSlot: null,
      sortOrder: primaryCoinEntry?.sortOrder ?? nextInventorySortOrder(inventoryEntries, entityId, { kind: "contained", parentEntryId: purseEntryId }, null),
      state: { coins: normalizedCoins },
      createdAt: primaryCoinEntry?.createdAt ?? timestamp,
      updatedAt: timestamp
    };

    set((state) => ({
      inventoryEntries: upsertById(
        state.inventoryEntries.filter((entry) => !idsToDelete.has(entry.id)),
        coinEntry
      )
    }));
    await Promise.all([
      repo.saveInventoryEntry(campaignId, coinEntry),
      ...[...idsToDelete].map((id) => repo.deleteInventoryEntry(campaignId, id))
    ]);
    return { ok: true };
  },

  async moveInventoryEntry({ entryId, entityId, location, handSlot = null, sortOrder }) {
    const { campaignId, inventoryEntries, catalogs, viewMode } = get();
    if (!campaignId || !repository) return { ok: false, message: "No campaign is loaded." };
    const entry = inventoryEntries.find((candidate) => candidate.id === entryId);
    if (!entry) return { ok: false, message: "Item no longer exists." };
    const placementValidation = validateInventoryPlacement({ entryId, entityId, location, entries: inventoryEntries, catalogs });
    if (!placementValidation.ok) return placementValidation;
    const normalizedHandSlot = handSlotForLocation(location, handSlot);
    const validation = validateHandAssignment(entityId, inventoryEntries, normalizedHandSlot, entryId);
    if (!validation.ok) return blockedHandResult(validation.blockers, catalogs, viewMode, normalizedHandSlot);
    const timestamp = nowIso();
    const item = entryItem(entry, catalogs);
    const descendantIds = collectInventoryDescendantIds(entryId, inventoryEntries);
    const destinationChanged =
      entry.entityId !== entityId ||
      !sameInventoryLocation(entry.location, location) ||
      (entry.handSlot ?? null) !== normalizedHandSlot;
    const nextSortOrder = normalizeSortOrder(sortOrder) ??
      (destinationChanged
        ? nextInventorySortOrder(inventoryEntries, entityId, location, normalizedHandSlot, descendantIds)
        : entry.sortOrder);
    if (shouldSplitForHandUse(entry, item, normalizedHandSlot)) {
      const [original, split] = splitInventoryEntry(entry, 1);
      const nextOriginal: InventoryEntry = {
        ...original,
        handSlot: null,
        state: original.state ? { ...original.state, isLit: false } : undefined,
        updatedAt: timestamp
      };
      const nextSplit: InventoryEntry = {
        ...split,
        entityId,
        location,
        handSlot: normalizedHandSlot,
        sortOrder: nextSortOrder,
        updatedAt: timestamp
      };
      set((state) => ({
        inventoryEntries: [...upsertById(state.inventoryEntries, nextOriginal), nextSplit]
      }));
      await repository.saveInventoryEntries(campaignId, [nextOriginal, nextSplit]);
      return { ok: true };
    }
    const nextEntry: InventoryEntry = {
      ...entry,
      entityId,
      location,
      handSlot: normalizedHandSlot,
      sortOrder: nextSortOrder,
      updatedAt: timestamp
    };
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

  async swapInventoryOrder(a, b) {
    const { campaignId, inventoryEntries } = get();
    if (!campaignId || !repository) return { ok: false, message: "No campaign is loaded." };
    const entryA = inventoryEntries.find((candidate) => candidate.id === a.entryId);
    const entryB = inventoryEntries.find((candidate) => candidate.id === b.entryId);
    if (!entryA || !entryB) return { ok: false, message: "Item no longer exists." };
    const timestamp = nowIso();
    const nextA: InventoryEntry = { ...entryA, sortOrder: a.sortOrder, updatedAt: timestamp };
    const nextB: InventoryEntry = { ...entryB, sortOrder: b.sortOrder, updatedAt: timestamp };
    set((state) => ({
      inventoryEntries: state.inventoryEntries.map((candidate) =>
        candidate.id === nextA.id ? nextA : candidate.id === nextB.id ? nextB : candidate
      )
    }));
    await repository.saveInventoryEntries(campaignId, [nextA, nextB]);
    return { ok: true };
  },

  async splitEntry(entryId, quantity) {
    const { campaignId, inventoryEntries, catalogs } = get();
    if (!campaignId || !repository) return;
    const entry = inventoryEntries.find((candidate) => candidate.id === entryId);
    if (!entry || entry.quantity <= 1 || isCoinEntry(entry, catalogs)) return;
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
    if (!item.emitsLight) return;
    const nextIsLit = !entry.state?.isLit;
    if (nextIsLit && entry.state?.isDepleted) return;
    const timestamp = nowIso();
    if (nextIsLit && shouldSplitForActiveUse(entry, item)) {
      const [original, split] = splitInventoryEntry(entry, 1);
      const nextOriginal: InventoryEntry = {
        ...original,
        state: { ...original.state, isLit: false },
        updatedAt: timestamp
      };
      const nextSplit: InventoryEntry = {
        ...split,
        state: activeLightState(item, entry.state),
        updatedAt: timestamp
      };
      set((state) => ({ inventoryEntries: [...upsertById(state.inventoryEntries, nextOriginal), nextSplit] }));
      await repository.saveInventoryEntries(campaignId, [nextOriginal, nextSplit]);
      return;
    }
    const nextEntry: InventoryEntry = {
      ...entry,
      state: {
        ...initialStateForTemplate(item),
        ...entry.state,
        isLit: nextIsLit,
        isDepleted: nextIsLit ? false : entry.state?.isDepleted
      },
      updatedAt: timestamp
    };
    set((state) => ({ inventoryEntries: upsertById(state.inventoryEntries, nextEntry) }));
    await repository.saveInventoryEntry(campaignId, nextEntry);
  },

  async spendTurn() {
    const { campaignId, inventoryEntries, catalogs } = get();
    if (!campaignId || !repository) return;
    const repo = repository;
    const timestamp = nowIso();
    const changed: InventoryEntry[] = [];
    const consumedIds = new Set<string>();
    for (const entry of inventoryEntries) {
      const result = spendLightTurn(entry, catalogs);
      if (!result) continue;
      if (result.disposition === "consumed") {
        if (entry.quantity > 1) {
          changed.push({
            ...entry,
            quantity: entry.quantity - 1,
            state: initialStateForTemplate(entryItem(entry, catalogs)),
            updatedAt: timestamp
          });
        } else {
          collectInventoryDescendantIds(entry.id, inventoryEntries).forEach((id) => consumedIds.add(id));
        }
      } else {
        changed.push({ ...result.entry, updatedAt: timestamp });
      }
    }
    if (changed.length === 0 && consumedIds.size === 0) return;
    set((state) => ({
      inventoryEntries: state.inventoryEntries
        .filter((entry) => !consumedIds.has(entry.id))
        .map((entry) => changed.find((next) => next.id === entry.id) ?? entry)
    }));
    await Promise.all([
      changed.length ? repo.saveInventoryEntries(campaignId, changed) : Promise.resolve(),
      ...[...consumedIds].map((id) => repo.deleteInventoryEntry(campaignId, id))
    ]);
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
  if (!template.emitsLight && !template.gear?.durationTurnsMax && !template.gear?.usesMax && !template.gear?.usesRemaining) return undefined;
  const usesRemaining = template.gear?.usesRemaining ?? template.gear?.usesMax ?? undefined;
  const state: InventoryEntry["state"] = {
    isLit: false,
    isDepleted: false,
    durationTurnsUsed: template.gear?.durationTurnsUsed ?? 0,
    durationTurnsMax: template.gear?.durationTurnsMax ?? null
  };
  if (usesRemaining !== undefined) state.usesRemaining = usesRemaining;
  return state;
}

function stateForItemUpdate(item: ItemTemplate, previousState: InventoryEntry["state"]): InventoryEntry["state"] | undefined {
  const initialState = initialStateForTemplate(item);
  if (!initialState && !previousState) return undefined;
  const usesRemaining = item.gear?.usesRemaining ?? item.gear?.usesMax ?? previousState?.usesRemaining ?? undefined;
  const coins = previousState?.coins && inventoryRecordTypeForItem(item) === "treasure" && item.name.trim().toLowerCase() === "coins"
    ? normalizeCoins(previousState.coins)
    : undefined;
  if (!initialState && coins) return { coins };
  const state: InventoryEntry["state"] = {
    ...initialState,
    customName: previousState?.customName ?? null,
    customDescription: previousState?.customDescription ?? null,
    chargesRemaining: previousState?.chargesRemaining ?? null,
    isLit: item.emitsLight ? previousState?.isLit ?? false : false,
    isDepleted: item.emitsLight ? previousState?.isDepleted ?? false : false,
    durationTurnsUsed: item.gear?.durationTurnsUsed ?? previousState?.durationTurnsUsed ?? 0,
    durationTurnsMax: item.gear?.durationTurnsMax ?? null
  };
  if (usesRemaining !== undefined) state.usesRemaining = usesRemaining;
  if (coins) state.coins = coins;
  return state;
}

function shouldSplitForHandUse(entry: InventoryEntry, item: ItemTemplate, handSlot: HandSlot | null): boolean {
  return shouldSplitQuantityForHandUse(entry.quantity, item, handSlot);
}

function shouldSplitQuantityForHandUse(quantity: number, item: ItemTemplate | undefined, handSlot: HandSlot | null): boolean {
  return Boolean(handSlot && quantity > 1 && (item?.handsRequired ?? 0) > 0);
}

function shouldSplitForActiveUse(entry: InventoryEntry, item: ItemTemplate): boolean {
  return entry.quantity > 1 && Boolean(item.emitsLight || item.gear?.durationTurnsMax || item.gear?.usesMax);
}

function createNewHeldUnitSplit({
  entityId,
  itemTemplateId,
  customItem,
  recordType,
  quantity,
  location,
  handSlot,
  carriedSortOrder,
  heldSortOrder,
  state,
  timestamp
}: {
  entityId: string;
  itemTemplateId?: string;
  customItem?: ItemTemplate;
  recordType?: InventoryEntry["recordType"];
  quantity: number;
  location: InventoryLocation;
  handSlot: HandSlot;
  carriedSortOrder: number;
  heldSortOrder: number;
  state: InventoryEntry["state"];
  timestamp: string;
}): InventoryEntry[] {
  const carriedEntry: InventoryEntry = {
    id: crypto.randomUUID(),
    recordType: recordType ?? (customItem ? inventoryRecordTypeForItem(customItem) : undefined),
    entityId,
    quantity: quantity - 1,
    location,
    handSlot: null,
    sortOrder: carriedSortOrder,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const heldEntry: InventoryEntry = {
    id: crypto.randomUUID(),
    recordType: recordType ?? (customItem ? inventoryRecordTypeForItem(customItem) : undefined),
    entityId,
    quantity: 1,
    location,
    handSlot,
    sortOrder: heldSortOrder,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  if (itemTemplateId) {
    carriedEntry.itemTemplateId = itemTemplateId;
    heldEntry.itemTemplateId = itemTemplateId;
  }
  if (customItem) {
    carriedEntry.customItem = customItem;
    heldEntry.customItem = customItem;
  }
  if (state) {
    carriedEntry.state = { ...state, isLit: false };
    heldEntry.state = { ...state };
  }
  return [carriedEntry, heldEntry];
}

function activeLightState(item: ItemTemplate, previousState: InventoryEntry["state"]): InventoryEntry["state"] {
  const initialState = initialStateForTemplate(item) ?? {};
  const state: InventoryEntry["state"] = {
    ...initialState,
    customName: previousState?.customName ?? null,
    customDescription: previousState?.customDescription ?? null,
    chargesRemaining: previousState?.chargesRemaining ?? null,
    isLit: true,
    isDepleted: false,
    durationTurnsUsed: item.gear?.durationTurnsUsed ?? 0,
    durationTurnsMax: item.gear?.durationTurnsMax ?? null
  };
  if (previousState?.usesRemaining !== undefined) state.usesRemaining = previousState.usesRemaining;
  return state;
}

function normalizeCustomItem(item: ItemTemplate, fallbackId: string): ItemTemplate {
  const type = item.type;
  const customItem: ItemTemplate = withInventoryRecordType({
    id: item.id || fallbackId,
    recordType: item.recordType,
    type,
    identified: item.identified ?? true,
    name: item.name.trim() || "Custom item",
    quantity: 1,
    slotsPerUnit: normalizeNonNegativeNumber(item.slotsPerUnit),
    stackSize: item.stackSize && item.stackSize > 1 ? Math.floor(item.stackSize) : null,
    handsRequired: item.handsRequired !== null && item.handsRequired !== undefined ? normalizeNonNegativeNumber(item.handsRequired) : null,
    emitsLight: Boolean(item.emitsLight),
    lightRadiusFeet: item.emitsLight ? normalizeNullableNumber(item.lightRadiusFeet) : null,
    cursed: item.cursed ?? false,
    curseDescription: item.curseDescription ?? null,
    gpValue: normalizeNullableNumber(item.gpValue)
  });
  const description = item.description?.trim();
  if (description) customItem.description = description;
  if (type === "weapon" && item.weapon) customItem.weapon = normalizeWeapon(item.weapon);
  if (type === "armor" && item.armor) customItem.armor = normalizeArmor(item.armor);
  if (type === "gear") customItem.gear = normalizeGear(item.gear, item.emitsLight);
  if (type === "container" && item.container) customItem.container = normalizeContainer(item.container);
  if (type === "treasure") customItem.treasure = {};
  return withInventoryRecordType(customItem);
}

function normalizeWeapon(weapon: NonNullable<ItemTemplate["weapon"]>): NonNullable<ItemTemplate["weapon"]> {
  return {
    damage: weapon.damage.trim() || "1d6",
    rangeShort: normalizeNullableNumber(weapon.rangeShort),
    rangeMedium: normalizeNullableNumber(weapon.rangeMedium),
    rangeLong: normalizeNullableNumber(weapon.rangeLong),
    qualities: weapon.qualities?.map((quality) => quality.trim()).filter(Boolean) ?? []
  };
}

function normalizeArmor(armor: NonNullable<ItemTemplate["armor"]>): NonNullable<ItemTemplate["armor"]> {
  return {
    armorType: armor.armorType,
    baseAcAscending: normalizeNullableNumber(armor.baseAcAscending),
    acBonus: normalizeNullableNumber(armor.acBonus),
    magicAcBonus: normalizeNullableNumber(armor.magicAcBonus)
  };
}

function normalizeGear(gear: ItemTemplate["gear"], emitsLight: boolean | undefined): NonNullable<ItemTemplate["gear"]> {
  const usesMax = normalizeNullableNumber(gear?.usesMax);
  return {
    gearKind: gear?.gearKind ?? "misc",
    usesMax,
    usesRemaining: normalizeNullableNumber(gear?.usesRemaining) ?? usesMax,
    consumedOnUse: gear?.consumedOnUse ?? false,
    durationTurnsMax: normalizeNullableNumber(gear?.durationTurnsMax),
    durationTurnsUsed: normalizeNullableNumber(gear?.durationTurnsUsed) ?? 0,
    durationDescription: gear?.durationDescription ?? null,
    containsSpells: false,
    spellData: null,
    language: null,
    readable: null,
    deciphered: null,
    rulesNote: emitsLight ? "Light source." : null
  };
}

function normalizeContainer(container: NonNullable<ItemTemplate["container"]>): NonNullable<ItemTemplate["container"]> {
  const normalizedContainer: NonNullable<ItemTemplate["container"]> = {
    capacitySlots: normalizeNonNegativeNumber(container.capacitySlots),
    canBeStowed: container.canBeStowed ?? true,
    slotsWhenStowed: normalizeNonNegativeNumber(container.slotsWhenStowed),
    loadCategory: container.loadCategory ?? "stowed"
  };
  const coinCapacity = normalizeNullableNumber(container.coinCapacity);
  if (coinCapacity !== null) normalizedContainer.coinCapacity = coinCapacity;
  return normalizedContainer;
}

function normalizeQuantity(quantity: number): number {
  return Math.max(1, Math.floor(Number.isFinite(quantity) ? quantity : 1));
}

function normalizeNonNegativeNumber(value: number | null | undefined): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? Number(value) : 0));
}

function normalizeNullableNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

function directChildrenOf(parentEntryId: string, entries: InventoryEntry[]): InventoryEntry[] {
  return entries.filter(
    (entry) =>
      isInventoryLocation(entry.location) &&
      entry.location.kind === "contained" &&
      entry.location.parentEntryId === parentEntryId
  );
}

function nextInventorySortOrder(
  entries: InventoryEntry[],
  entityId: string,
  location: InventoryLocation,
  handSlot: HandSlot | null,
  excludedEntryIds = new Set<string>()
): number {
  const siblingEntries = inventoryDestinationEntries(entries, entityId, location, handSlot, excludedEntryIds);
  if (siblingEntries.length === 0) return 10;
  const maxOrder = siblingEntries.reduce((max, entry, index) => {
    const sortOrder = normalizeSortOrder(entry.sortOrder) ?? (index + 1) * 10;
    return Math.max(max, sortOrder);
  }, 0);
  return maxOrder + 10;
}

function inventoryDestinationEntries(
  entries: InventoryEntry[],
  entityId: string,
  location: InventoryLocation,
  handSlot: HandSlot | null,
  excludedEntryIds = new Set<string>()
): InventoryEntry[] {
  return entries.filter(
    (entry) =>
      !excludedEntryIds.has(entry.id) &&
      entry.entityId === entityId &&
      sameInventoryLocation(entry.location, location) &&
      (entry.handSlot ?? null) === handSlot
  );
}

function sameInventoryLocation(left: InventoryLocation, right: InventoryLocation): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "equipped") return true;
  return right.kind === "contained" && left.parentEntryId === right.parentEntryId;
}

function normalizeSortOrder(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const exists = items.some((candidate) => candidate.id === item.id);
  if (!exists) return [...items, item];
  return items.map((candidate) => (candidate.id === item.id ? item : candidate));
}

function blockedHandResult(entries: InventoryEntry[], catalogs: Catalogs, viewMode: ViewMode, handSlot: HandSlot | null): InventoryActionResult {
  const itemNames = entries.map((entry) => displayName(entry, catalogs, viewMode)).join(", ");
  return {
    ok: false,
    message: handSlot === "both_hands"
      ? `That item needs two free hands; blocked by ${itemNames}.`
      : `That hand is already occupied by ${itemNames}.`
  };
}
