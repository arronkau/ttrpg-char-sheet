import rawClasses from "../../data/ose_af_classes_v3.json";
import rawItems from "../../data/ose_equipment_items_spec_v2.json";
import rawSpells from "../../data/av_converted_spells_character_app.json";
import type { Catalogs, ClassDefinition, ItemTemplate, SpellReference } from "../types";

type ClassesFile = {
  classes: Array<Omit<ClassDefinition, "id"> & { id?: string }>;
};

type ItemsFile = {
  items: ItemTemplate[];
};

type SpellsFile = {
  spells: Array<Omit<SpellReference, "normalizedClasses">>;
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

  const items = (rawItems as unknown as ItemsFile).items.map((item) => ({
    ...item,
    identified: item.identified ?? true,
    quantity: item.quantity ?? 1,
    slotsPerUnit: item.slotsPerUnit ?? 0,
    emitsLight: item.emitsLight ?? false,
    cursed: item.cursed ?? false
  }));

  const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));

  const spells = (rawSpells as unknown as SpellsFile).spells.map((spell) => ({
    ...spell,
    normalizedClasses: spell.classes.map((spellClass) => ({
      classId: normalizeSpellClassId(spellClass.class),
      level: spellClass.level
    }))
  }));

  const spellsById = Object.fromEntries(spells.map((spell) => [spell.id, spell]));

  return {
    classes,
    classesById,
    items,
    itemsById,
    spells,
    spellsById
  };
}

export const catalogs = buildCatalogs();

export function itemSearchText(item: ItemTemplate): string {
  return [
    item.name,
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
