import { normalizeSpellClassId } from "./catalogs";
import type { SpellCatalog, SpellCatalogEntry, SpellReference } from "../types";

type SpellsFile = {
  spells: Array<Omit<SpellReference, "normalizedClasses">>;
};

let spellCatalogPromise: Promise<SpellCatalog> | null = null;

export function loadSpellCatalog(): Promise<SpellCatalog> {
  spellCatalogPromise ??= import("../../data/av_converted_spells_character_app.json").then((module) =>
    buildSpellCatalog(module.default as SpellsFile)
  );
  return spellCatalogPromise;
}

export function buildSpellCatalog(file: SpellsFile): SpellCatalog {
  const spells: SpellCatalogEntry[] = file.spells.map((spell) => {
    const normalizedClasses = spell.classes.map((spellClass) => ({
      classId: normalizeSpellClassId(spellClass.class),
      level: spellClass.level
    }));
    const classSummary = normalizedClasses.map((spellClass) => `${spellClass.classId} ${spellClass.level}`).join(", ");
    const searchText = [
      spell.name,
      spell.description,
      spell.source,
      spell.range,
      spell.duration,
      spell.save,
      spell.area,
      spell.target,
      classSummary
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return {
      ...spell,
      normalizedClasses,
      classSummary,
      searchText
    };
  });
  const spellsById = Object.fromEntries(spells.map((spell) => [spell.id, spell]));
  return { spells, spellsById };
}
