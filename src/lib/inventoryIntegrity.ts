import type {
  Catalogs,
  HandSlot,
  InventoryActionResult,
  InventoryEntry,
  InventoryLocation,
  ItemTemplate
} from "../types";
import { inventoryRecordTypeForEntry, inventoryRecordTypeForItem, isInventoryRecordType } from "./inventoryRecordTypes";
import type { CampaignSnapshot } from "./seed";

type RecordValue = Record<string, unknown>;

export function isInventoryLocation(value: unknown): value is InventoryLocation {
  if (!isRecord(value)) return false;
  if (value.kind === "equipped") return true;
  return value.kind === "contained" && typeof value.parentEntryId === "string" && value.parentEntryId.length > 0;
}

export function isHandSlotValue(value: unknown): value is HandSlot {
  return value === "left_hand" || value === "right_hand" || value === "both_hands";
}

export function inventoryParentEntryId(entry: InventoryEntry): string | null {
  return isInventoryLocation(entry.location) && entry.location.kind === "contained" ? entry.location.parentEntryId : null;
}

export function collectInventoryDescendantIds(entryId: string, entries: InventoryEntry[]): Set<string> {
  const ids = new Set([entryId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of entries) {
      const parentId = inventoryParentEntryId(entry);
      if (parentId && ids.has(parentId) && !ids.has(entry.id)) {
        ids.add(entry.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function validateInventoryPlacement({
  entryId,
  entityId,
  location,
  entries,
  catalogs,
  childItem
}: {
  entryId?: string;
  entityId: string;
  location: InventoryLocation;
  entries: InventoryEntry[];
  catalogs: Catalogs;
  childItem?: ItemTemplate;
}): InventoryActionResult {
  if (!isInventoryLocation(location)) return { ok: false, message: "Choose a valid inventory location." };
  if (location.kind === "equipped") return { ok: true };

  const parent = entries.find((entry) => entry.id === location.parentEntryId);
  const childEntry = entryId ? entries.find((entry) => entry.id === entryId) : undefined;
  const child = childItem ?? (childEntry ? itemForEntry(childEntry, catalogs) : undefined);
  if (!parent) return { ok: false, message: "Choose a valid container." };
  if (parent.entityId !== entityId) return { ok: false, message: "Choose a container carried by the target entity." };
  if (entryId && parent.id === entryId) return { ok: false, message: "An item cannot be placed inside itself." };
  const parentItem = itemForEntry(parent, catalogs);
  if (parentItem?.type !== "container") {
    return { ok: false, message: "Items can only be placed inside containers." };
  }
  if (entryId && collectInventoryDescendantIds(entryId, entries).has(parent.id)) {
    return { ok: false, message: "A container cannot be placed inside one of its own contents." };
  }
  if (isCoinPurseItem(parentItem) && child && !canPlaceInCoinPurse(child, childEntry)) {
    return { ok: false, message: "Coin purses can only hold coins and zero-slot treasure." };
  }

  return { ok: true };
}

export function isCurrentCampaignSnapshot(value: unknown, catalogs: Catalogs): value is CampaignSnapshot {
  if (!isRecord(value) || !isRecord(value.campaign)) return false;
  if (!Array.isArray(value.entities) || !Array.isArray(value.inventoryEntries)) return false;

  const entityIds = new Set<string>();
  for (const entity of value.entities) {
    if (!isRecord(entity) || typeof entity.id !== "string" || typeof entity.active !== "boolean") return false;
    if (entityIds.has(entity.id)) return false;
    entityIds.add(entity.id);
  }

  const entries = value.inventoryEntries as unknown[];
  const entryById = new Map<string, RecordValue>();
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.entityId !== "string") return false;
    if (!entityIds.has(entry.entityId) || entryById.has(entry.id) || "placement" in entry) return false;
    if (entry.recordType !== undefined && !isInventoryRecordType(entry.recordType)) return false;
    if (!isInventoryLocation(entry.location)) return false;
    if (entry.handSlot !== undefined && entry.handSlot !== null && !isHandSlotValue(entry.handSlot)) return false;
    entryById.set(entry.id, entry);
  }

  for (const entry of entryById.values()) {
    const location = entry.location as InventoryLocation;
    if (location.kind !== "contained") continue;
    const parent = entryById.get(location.parentEntryId);
    if (!parent) return false;
    if (parent.entityId !== entry.entityId) return false;
    if (itemForEntry(parent as unknown as InventoryEntry, catalogs)?.type !== "container") return false;
  }

  for (const entry of entryById.values()) {
    if (hasContainmentCycle(entry, entryById)) return false;
  }

  return true;
}

function hasContainmentCycle(entry: RecordValue, entryById: Map<string, RecordValue>): boolean {
  const seenIds = new Set<string>();
  let current: RecordValue | undefined = entry;
  while (current && isInventoryLocation(current.location) && current.location.kind === "contained") {
    if (seenIds.has(current.id as string)) return true;
    seenIds.add(current.id as string);
    current = entryById.get(current.location.parentEntryId);
  }
  return false;
}

function itemForEntry(entry: InventoryEntry, catalogs: Catalogs): ItemTemplate | undefined {
  if (entry.customItem) return entry.customItem;
  return entry.itemTemplateId ? catalogs.itemsById[entry.itemTemplateId] : undefined;
}

function isCoinPurseItem(item: ItemTemplate): boolean {
  return item.type === "container" && item.container?.coinCapacity !== undefined;
}

function canPlaceInCoinPurse(item: ItemTemplate, entry: InventoryEntry | undefined): boolean {
  return isCoinEntry(entry, item) || (inventoryRecordTypeForItem(item) === "treasure" && item.slotsPerUnit <= 0);
}

function isCoinEntry(entry: InventoryEntry | undefined, item: ItemTemplate): boolean {
  return entry ? inventoryRecordTypeForEntry(entry, item) === "coins" : inventoryRecordTypeForItem(item) === "treasure" && item.name.trim().toLowerCase() === "coins";
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}
