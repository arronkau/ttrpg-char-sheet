import { describe, expect, it } from "vitest";
import type { Entity, InventoryEntry } from "../types";
import { catalogs } from "./catalogs";
import {
  armorClass,
  buildInventoryTree,
  classRestrictionWarnings,
  entrySlots,
  isActiveLight,
  levelForXp,
  movementForSlots,
  splitInventoryEntry,
  spendLightTurnPatch,
  stackSlots,
  turnsRemaining
} from "./rules";
import { nowIso } from "./seed";

const timestamp = nowIso();

describe("slot and encumbrance rules", () => {
  it("calculates stacked slots", () => {
    expect(stackSlots(6, 1, 3)).toBe(2);
    expect(stackSlots(450, 1, 100)).toBe(5);
    expect(stackSlots(2, 1, null)).toBe(2);
  });

  it("uses slotsWhenStowed for containers inside containers", () => {
    const entry = inventory("backpack", "entity", "item_backpack_001", 1, "container", "sack");
    expect(entrySlots(entry, catalogs)).toBe(1);
  });

  it("maps carried slots to movement thresholds", () => {
    expect(movementForSlots(5).movementExploration).toBe(120);
    expect(movementForSlots(6).movementEncounter).toBe(30);
    expect(movementForSlots(21).overloaded).toBe(true);
  });
});

describe("inventory tree behavior", () => {
  it("marks over-capacity containers", () => {
    const entries = [
      inventory("pouch", "entity", "item_belt_pouch_005", 1, "equipped"),
      inventory("chain", "entity", "item_chainmail_068", 1, "container", "pouch")
    ];
    const tree = buildInventoryTree(entries, catalogs);
    const pouch = tree.allNodes.find((node) => node.entry.id === "pouch");
    expect(pouch?.capacitySlots).toBe(1);
    expect(pouch?.usedSlots).toBe(2);
    expect(pouch?.overCapacity).toBe(true);
  });

  it("splits a stack into two entries", () => {
    const [original, split] = splitInventoryEntry(inventory("torch", "entity", "item_torch_056", 6, "carried_loose"), 2);
    expect(original.quantity).toBe(4);
    expect(split.quantity).toBe(2);
    expect(split.id).not.toBe(original.id);
  });
});

describe("light tracking", () => {
  it("counts light only when lit and duration remains", () => {
    const torch = inventory("torch", "entity", "item_torch_056", 1, "in_hand");
    torch.state = { isLit: true, durationTurnsUsed: 5, durationTurnsMax: 6 };
    expect(isActiveLight(torch, catalogs)).toBe(true);
    expect(turnsRemaining(torch, catalogs.itemsById["item_torch_056"])).toBe(1);
    const next = spendLightTurnPatch(torch, catalogs);
    expect(next?.state?.isLit).toBe(false);
    expect(next?.state?.durationTurnsUsed).toBe(6);
  });
});

describe("character derivations", () => {
  it("calculates level from class XP tables", () => {
    expect(levelForXp(catalogs.classesById["dwarf"], 2400)).toBe(2);
  });

  it("calculates AC from equipped armor, shield, dexterity, and magic fields", () => {
    const entity = character("fighter", "fighter", 14);
    const entries = [
      inventory("chain", entity.id, "item_chainmail_068", 1, "equipped"),
      inventory("shield", entity.id, "item_shield_071", 1, "equipped")
    ];
    expect(armorClass(entity, entries, catalogs)).toBe(16);
  });

  it("warns when class armor proficiencies are exceeded", () => {
    const entity = character("mage", "magic-user", 10);
    const entries = [inventory("chain", entity.id, "item_chainmail_068", 1, "equipped")];
    expect(classRestrictionWarnings(entity, entries, catalogs)[0]?.message).toContain("Magic-User");
  });
});

function character(id: string, classId: string, dexterity: number): Entity {
  return {
    id,
    type: "character",
    name: id,
    classId,
    xp: 0,
    abilities: {
      strength: 10,
      intelligence: 10,
      wisdom: 10,
      dexterity,
      constitution: 10,
      charisma: 10
    },
    hp: { currentHp: 4, maxHp: 4 },
    active: true,
    sortOrder: 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function inventory(
  id: string,
  entityId: string,
  itemTemplateId: string,
  quantity: number,
  location: InventoryEntry["location"],
  parentEntryId: string | null = null
): InventoryEntry {
  return {
    id,
    entityId,
    itemTemplateId,
    quantity,
    location,
    parentEntryId,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
