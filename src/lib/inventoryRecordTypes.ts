import type { InventoryEntry, InventoryRecordType, ItemTemplate, ItemType } from "../types";

const RECORD_TYPES = new Set<InventoryRecordType>(["coins", "treasure", "weapon", "armor", "equipment"]);

export function isInventoryRecordType(value: unknown): value is InventoryRecordType {
  return typeof value === "string" && RECORD_TYPES.has(value as InventoryRecordType);
}

export function inventoryRecordTypeForItemType(type: ItemType): InventoryRecordType {
  if (type === "gear" || type === "container") return "equipment";
  return type;
}

export function inventoryRecordTypeForItem(item: ItemTemplate): InventoryRecordType {
  if (isInventoryRecordType(item.recordType)) return item.recordType;
  return inventoryRecordTypeForItemType(item.type);
}

export function inventoryRecordTypeForEntry(entry: InventoryEntry, item?: ItemTemplate): InventoryRecordType {
  if (entry.state?.coins) return "coins";
  if (item && isLegacyCoinItem(item, entry)) return "coins";
  if (isInventoryRecordType(entry.recordType)) return entry.recordType;
  if (entry.customItem) return inventoryRecordTypeForItem(entry.customItem);
  return item ? inventoryRecordTypeForItem(item) : "equipment";
}

export function withInventoryRecordType<T extends ItemTemplate>(item: T): T {
  return {
    ...item,
    recordType: inventoryRecordTypeForItem(item)
  };
}

function isLegacyCoinItem(item: ItemTemplate, entry: InventoryEntry): boolean {
  const name = (entry.state?.customName ?? item.name).trim().toLowerCase();
  return inventoryRecordTypeForItem(item) === "treasure" && name === "coins";
}
