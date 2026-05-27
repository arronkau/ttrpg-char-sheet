import { describe, expect, it } from "vitest";
import { buildCatalogs, classNameToId, normalizeSpellClassId } from "./catalogs";

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

  it("loads the bundled reference catalogs", () => {
    const catalogs = buildCatalogs();
    expect(catalogs.classesById["magic-user"].class_name).toBe("Magic-User");
    expect(catalogs.itemsById["item_backpack_001"].container?.capacitySlots).toBeGreaterThan(0);
    expect(catalogs.spells.length).toBeGreaterThan(100);
    expect(catalogs.spells.every((spell) => spell.normalizedClasses.length > 0)).toBe(true);
  });
});
