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

  it("loads and derives the async spell catalog", async () => {
    const spellCatalog = await loadSpellCatalog();
    expect(spellCatalog.spells.length).toBeGreaterThan(100);
    expect(spellCatalog.spells.every((spell) => spell.normalizedClasses.length > 0)).toBe(true);
    expect(spellCatalog.spellsById["acid-arrow"].searchText).toContain("acid arrow");
    expect(spellCatalog.spellsById["acid-arrow"].classSummary).toContain("magic-user 2");
  });

  it("defaults stackable standard items to a full stack", () => {
    const catalogs = buildCatalogs();
    expect(defaultInventoryQuantity(catalogs.itemsById["item_torch_056"])).toBe(3);
    expect(defaultInventoryQuantity(catalogs.itemsById["item_backpack_001"])).toBe(1);
  });
});
