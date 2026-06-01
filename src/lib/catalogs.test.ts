import { describe, expect, it } from "vitest";
import { buildCatalogs, classNameToId, defaultInventoryQuantity, normalizeSpellClassId } from "./catalogs";
import { loadSpellCatalog } from "./spellCatalog";

describe("catalog normalization", () => {
  it("creates stable class ids from display names", () => {
    expect(classNameToId("Magic-User")).toBe("magic-user");
    expect(classNameToId("Half-Elf")).toBe("half-elf");
    expect(classNameToId("Svirfneblin")).toBe("svirfneblin");
  });

  it("maps underscore spell class ids to app class ids", () => {
    expect(normalizeSpellClassId("magic_user")).toBe("magic-user");
    expect(normalizeSpellClassId("illusionist")).toBe("illusionist");
  });

  it("loads the bundled core reference catalogs", () => {
    const catalogs = buildCatalogs();
    expect(catalogs.classesById["magic-user"].class_name).toBe("Magic-User");
    expect(catalogs.itemsById["item_backpack_001"].container?.capacitySlots).toBeGreaterThan(0);
    expect(catalogs.itemsById["item_belt_pouch_005"].container?.coinCapacity).toBe(100);
  });

  it("loads optional expertise point data only for matching class names", () => {
    const catalogs = buildCatalogs();
    expect(catalogs.classesById["thief"].feature_progression?.expertise_points?.points_by_level["1"]).toBe(6);
    expect(catalogs.classesById["acrobat"].feature_progression?.expertise_points?.points_by_level["1"]).toBe(4);
    expect(catalogs.classesById["assassin"].feature_progression?.expertise_points?.points_by_level["5"]).toBe(0);
    expect(catalogs.classesById["magic-user"].feature_progression?.expertise_points).toBeUndefined();
    expect(catalogs.classesById["cleric"].feature_progression?.expertise_points).toBeUndefined();
  });

  it("loads and derives the async spell catalog", async () => {
    const spellCatalog = await loadSpellCatalog();
    expect(spellCatalog.spells.length).toBeGreaterThan(100);
    expect(
      spellCatalog.spells.every((spell) => spell.id && spell.name && spell.normalizedClasses.length > 0)
    ).toBe(true);
    expect(spellCatalog.spellsById["cure-light-wounds-cleric"].searchText).toContain("cure light wounds");
    expect(spellCatalog.spellsById["cure-light-wounds-cleric"].classSummary).toContain("cleric 1");
  });

  it("loads OSE Advanced Fantasy spell records by class list without collapsing duplicate names", async () => {
    const spellCatalog = await loadSpellCatalog();
    const classes = new Set(spellCatalog.spells.flatMap((spell) => spell.normalizedClasses.map((spellClass) => spellClass.classId)));
    expect(classes).toEqual(new Set(["cleric", "druid", "illusionist", "magic-user"]));

    const cureLightWounds = spellCatalog.spells.filter((spell) => spell.name === "Cure Light Wounds");
    expect(cureLightWounds.length).toBeGreaterThan(1);
    expect(new Set(cureLightWounds.map((spell) => spell.id)).size).toBe(cureLightWounds.length);
  });

  it("defaults stackable standard items to a full stack", () => {
    const catalogs = buildCatalogs();
    expect(defaultInventoryQuantity(catalogs.itemsById["item_torch_056"])).toBe(3);
    expect(defaultInventoryQuantity(catalogs.itemsById["item_backpack_001"])).toBe(1);
  });
});
