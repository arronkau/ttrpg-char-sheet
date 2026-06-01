import rawClasses from "../../data/ose_af_classes_v3.json";
import rawItems from "../../data/ose_equipment_items_spec_v2.json";
import type { Catalogs, ClassDefinition, ItemTemplate } from "../types";
import { inventoryRecordTypeForItem, withInventoryRecordType } from "./inventoryRecordTypes";

type ClassesFile = {
  classes: Array<Omit<ClassDefinition, "id"> & { id?: string }>;
};

type ItemsFile = {
  items: ItemTemplate[];
};

export function classNameToId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeSpellClassId(classId: string): string {
  return classId.trim().toLowerCase().replace(/_/g, "-");
}

export function buildCatalogs(): Catalogs {
  const classes = (rawClasses as unknown as ClassesFile).classes.map((classDef) => ({
    ...classDef,
    id: classDef.id ?? classNameToId(classDef.class_name)
  }));

  const classesById = Object.fromEntries(classes.map((classDef) => [classDef.id, classDef]));

  const items = (rawItems as unknown as ItemsFile).items.map((item) =>
    withInventoryRecordType({
      ...item,
      identified: item.identified ?? true,
      quantity: item.quantity ?? 1,
      slotsPerUnit: item.slotsPerUnit ?? 0,
      emitsLight: item.emitsLight ?? false,
      cursed: item.cursed ?? false,
      container: item.container
        ? {
            ...item.container,
            loadCategory: item.container.loadCategory ?? (item.id === "item_belt_pouch_005" ? "equipped" : "stowed"),
            coinCapacity: item.container.coinCapacity ?? (item.id === "item_belt_pouch_005" ? 100 : undefined)
          }
        : undefined
    })
  );

  const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));

  return {
    classes,
    classesById,
    items,
    itemsById
  };
}

export const catalogs = buildCatalogs();

export function itemSearchText(item: ItemTemplate): string {
  return [
    item.name,
    inventoryRecordTypeForItem(item),
    item.type,
    item.description,
    item.weapon?.qualities?.join(" "),
    item.gear?.gearKind,
    item.source
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function defaultInventoryQuantity(item: ItemTemplate): number {
  return item.stackSize && item.stackSize > 1 ? item.stackSize : item.quantity || 1;
}
