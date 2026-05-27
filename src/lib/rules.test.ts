import { describe, expect, it } from "vitest";
import type { Entity, HandSlot, InventoryEntry, InventoryLocation, ItemTemplate } from "../types";
import { catalogs } from "./catalogs";
import { isCurrentCampaignSnapshot, validateInventoryPlacement } from "./inventoryIntegrity";
import {
  armorClass,
  buildInventoryTree,
  classRestrictionWarnings,
  entityHandOccupancy,
  entityLoadBreakdown,
  entrySlots,
  handSlotForLocation,
  isActiveLight,
  levelForXp,
  movementForSlots,
  splitInventoryEntry,
  spendLightTurnPatch,
  stackSlots,
  summarizeEntity,
  turnsRemaining,
  validateHandAssignment
} from "./rules";
import { createStarterCampaign, createTreasureItem, nowIso } from "./seed";

const timestamp = nowIso();

describe("slot and encumbrance rules", () => {
  it("calculates stacked slots", () => {
    expect(stackSlots(6, 1, 3)).toBe(2);
    expect(stackSlots(450, 1, 100)).toBe(5);
    expect(stackSlots(2, 1, null)).toBe(2);
  });

  it("uses slotsWhenStowed for containers inside containers", () => {
    const entry = inventory("backpack", "entity", "item_backpack_001", 1, {
      kind: "contained",
      parentEntryId: "sack"
    });
    expect(entrySlots(entry, catalogs)).toBe(1);
  });

  it("maps carried slots to movement thresholds", () => {
    expect(movementForSlots(5).movementExploration).toBe(120);
    expect(movementForSlots(6).movementEncounter).toBe(30);
    expect(movementForSlots(21).overloaded).toBe(true);
  });
});

describe("inventory tree behavior", () => {
  it("builds contained item trees and marks over-capacity containers", () => {
    const entries = [
      inventory("pouch", "entity", "item_belt_pouch_005", 1, { kind: "equipped" }),
      inventory("chain", "entity", "item_chainmail_068", 1, { kind: "contained", parentEntryId: "pouch" })
    ];
    const tree = buildInventoryTree(entries, catalogs);
    const pouch = tree.allNodes.find((node) => node.entry.id === "pouch");
    expect(pouch?.capacitySlots).toBe(1);
    expect(pouch?.usedSlots).toBe(2);
    expect(pouch?.overCapacity).toBe(true);
    expect(tree.byEntityId.entity).toHaveLength(1);
  });

  it("renders impossible containment cycles as roots instead of recursing forever", () => {
    const entries = [
      inventory("pouch", "entity", "item_belt_pouch_005", 1, {
        kind: "contained",
        parentEntryId: "pouch"
      })
    ];
    const tree = buildInventoryTree(entries, catalogs);
    expect(tree.byEntityId.entity).toHaveLength(1);
    expect(tree.byEntityId.entity[0].children).toHaveLength(0);
  });

  it("splits a stack into two entries", () => {
    const [original, split] = splitInventoryEntry(
      inventory("torch", "entity", "item_torch_056", 6, { kind: "equipped" }),
      2
    );
    expect(original.quantity).toBe(4);
    expect(split.quantity).toBe(2);
    expect(split.id).not.toBe(original.id);
  });
});

describe("location load behavior", () => {
  it("counts coins in an equipped belt pouch as equipped load", () => {
    const entries = [
      inventory("pouch", "entity", "item_belt_pouch_005", 1, { kind: "equipped" }),
      customInventory("coins", "entity", createTreasureItem("coins", "Coins", "Loose coins", 1, 1), 150, {
        kind: "contained",
        parentEntryId: "pouch"
      })
    ];
    const load = entityLoadBreakdown("entity", entries, catalogs);
    expect(catalogs.itemsById["item_belt_pouch_005"].container?.loadCategory).toBe("equipped");
    expect(load.equippedSlots).toBe(2);
    expect(load.stowedSlots).toBe(0);
    expect(load.carriedSlots).toBe(2);
  });

  it("counts gear in a backpack as stowed load", () => {
    const entries = [
      inventory("backpack", "entity", "item_backpack_001", 1, { kind: "equipped" }),
      inventory("torch", "entity", "item_torch_056", 3, { kind: "contained", parentEntryId: "backpack" })
    ];
    const load = entityLoadBreakdown("entity", entries, catalogs);
    expect(catalogs.itemsById["item_backpack_001"].container?.loadCategory).toBe("stowed");
    expect(load.equippedSlots).toBe(0);
    expect(load.stowedSlots).toBe(2);
    expect(load.carriedSlots).toBe(2);
  });

  it("lets a carried sack occupy a hand while counting as stowed load", () => {
    const entries = [inventory("sack", "entity", "item_sack_048", 1, { kind: "equipped" }, "left_hand")];
    const load = entityLoadBreakdown("entity", entries, catalogs);
    const hands = entityHandOccupancy("entity", entries);
    expect(load.stowedSlots).toBe(1);
    expect(load.equippedSlots).toBe(0);
    expect(hands.left_hand.map((entry) => entry.id)).toContain("sack");
  });

  it("has no dropped or left-behind movement behavior", () => {
    const entity = character("fighter", "fighter", 10);
    const entries = [inventory("backpack", entity.id, "item_backpack_001", 1, { kind: "equipped" })];
    const summary = summarizeEntity(entity, entries, catalogs, "gm");
    expect("droppedSlots" in summary).toBe(false);
    expect(summary.movementExploration).toBe(120);
  });
});

describe("hand behavior", () => {
  it("blocks left, right, and both-hands conflicts", () => {
    const entries = [
      inventory("shield", "entity", "item_shield_071", 1, { kind: "equipped" }, "left_hand"),
      inventory("sword", "entity", "item_sword_096", 1, { kind: "equipped" }, "right_hand")
    ];

    expect(validateHandAssignment("entity", entries, "left_hand").ok).toBe(false);
    expect(validateHandAssignment("entity", entries, "right_hand").ok).toBe(false);
    expect(validateHandAssignment("entity", entries, "both_hands").ok).toBe(false);
    expect(validateHandAssignment("entity", entries, "left_hand", "shield").ok).toBe(true);
  });

  it("treats both-hands items as occupying left and right hands", () => {
    const entries = [inventory("bow", "entity", "item_short_bow_091", 1, { kind: "equipped" }, "both_hands")];
    const hands = entityHandOccupancy("entity", entries);
    expect(hands.left_hand.map((entry) => entry.id)).toEqual(["bow"]);
    expect(hands.right_hand.map((entry) => entry.id)).toEqual(["bow"]);
    expect(validateHandAssignment("entity", entries, "left_hand").ok).toBe(false);
  });

  it("clears hand assignment for contained locations", () => {
    expect(handSlotForLocation({ kind: "contained", parentEntryId: "pack" }, "left_hand")).toBeNull();
    expect(handSlotForLocation({ kind: "equipped" }, "left_hand")).toBe("left_hand");
  });

  it("warns when equipped items require more hands than assigned", () => {
    const entity = character("fighter", "fighter", 10);
    const entries = [inventory("sack", entity.id, "item_sack_048", 1, { kind: "equipped" })];
    const summary = summarizeEntity(entity, entries, catalogs, "gm");
    expect(summary.warnings.some((warning) => warning.message.includes("requires 1 hand"))).toBe(true);
  });
});

describe("inventory integrity validation", () => {
  it("accepts current equipped and contained locations", () => {
    const entries = [
      inventory("pack", "entity", "item_backpack_001", 1, { kind: "equipped" }),
      inventory("torch", "entity", "item_torch_056", 1, { kind: "contained", parentEntryId: "pack" })
    ];
    expect(isCurrentCampaignSnapshot(schemaSnapshot(entries), catalogs)).toBe(true);
    expect(validateInventoryPlacement({ entityId: "entity", location: { kind: "contained", parentEntryId: "pack" }, entries, catalogs }).ok).toBe(true);
  });

  it("rejects old location and placement shapes", () => {
    const oldLocation = {
      ...inventory("torch", "entity", "item_torch_056", 1, { kind: "equipped" }),
      location: "equipped"
    } as unknown as InventoryEntry;
    const oldPlacement = {
      ...inventory("torch", "entity", "item_torch_056", 1, { kind: "equipped" }),
      placement: { kind: "equipped" }
    } as unknown as InventoryEntry;

    expect(isCurrentCampaignSnapshot(schemaSnapshot([oldLocation]), catalogs)).toBe(false);
    expect(isCurrentCampaignSnapshot(schemaSnapshot([oldPlacement]), catalogs)).toBe(false);
  });

  it("rejects missing, non-container, and cross-entity parents", () => {
    const missingParent = [inventory("torch", "entity", "item_torch_056", 1, { kind: "contained", parentEntryId: "missing" })];
    const nonContainerParent = [
      inventory("torch", "entity", "item_torch_056", 1, { kind: "equipped" }),
      inventory("coins", "entity", "item_belt_pouch_005", 1, { kind: "contained", parentEntryId: "torch" })
    ];
    const crossEntityParent = [
      inventory("pack", "other", "item_backpack_001", 1, { kind: "equipped" }),
      inventory("torch", "entity", "item_torch_056", 1, { kind: "contained", parentEntryId: "pack" })
    ];

    expect(isCurrentCampaignSnapshot(schemaSnapshot(missingParent), catalogs)).toBe(false);
    expect(isCurrentCampaignSnapshot(schemaSnapshot(nonContainerParent), catalogs)).toBe(false);
    expect(isCurrentCampaignSnapshot(schemaSnapshot(crossEntityParent), catalogs)).toBe(false);
    expect(validateInventoryPlacement({ entityId: "entity", location: { kind: "contained", parentEntryId: "pack" }, entries: crossEntityParent, catalogs }).ok).toBe(false);
  });

  it("rejects self and descendant containment cycles", () => {
    const selfCycle = [inventory("pack", "entity", "item_backpack_001", 1, { kind: "contained", parentEntryId: "pack" })];
    const descendantCycle = [
      inventory("pack", "entity", "item_backpack_001", 1, { kind: "contained", parentEntryId: "pouch" }),
      inventory("pouch", "entity", "item_belt_pouch_005", 1, { kind: "contained", parentEntryId: "pack" })
    ];
    const validTree = [
      inventory("pack", "entity", "item_backpack_001", 1, { kind: "equipped" }),
      inventory("pouch", "entity", "item_belt_pouch_005", 1, { kind: "contained", parentEntryId: "pack" })
    ];

    expect(isCurrentCampaignSnapshot(schemaSnapshot(selfCycle), catalogs)).toBe(false);
    expect(isCurrentCampaignSnapshot(schemaSnapshot(descendantCycle), catalogs)).toBe(false);
    expect(validateInventoryPlacement({ entryId: "pack", entityId: "entity", location: { kind: "contained", parentEntryId: "pack" }, entries: validTree, catalogs }).ok).toBe(false);
    expect(validateInventoryPlacement({ entryId: "pack", entityId: "entity", location: { kind: "contained", parentEntryId: "pouch" }, entries: validTree, catalogs }).ok).toBe(false);
  });
});

describe("light tracking", () => {
  it("counts light only when lit, duration remains, and the item is held in hand", () => {
    const readyTorch = inventory("ready-torch", "entity", "item_torch_056", 1, { kind: "equipped" });
    readyTorch.state = { isLit: true, durationTurnsUsed: 5, durationTurnsMax: 6 };
    expect(isActiveLight(readyTorch, catalogs)).toBe(false);

    const handTorch = inventory("hand-torch", "entity", "item_torch_056", 1, { kind: "equipped" }, "left_hand");
    handTorch.state = { isLit: true, durationTurnsUsed: 5, durationTurnsMax: 6 };
    expect(isActiveLight(handTorch, catalogs)).toBe(true);
    expect(turnsRemaining(handTorch, catalogs.itemsById["item_torch_056"])).toBe(1);
    const next = spendLightTurnPatch(handTorch, catalogs);
    expect(next?.state?.isLit).toBe(false);
    expect(next?.state?.durationTurnsUsed).toBe(6);
  });
});

describe("character derivations", () => {
  it("calculates level from class XP tables", () => {
    expect(levelForXp(catalogs.classesById["dwarf"], 2400)).toBe(2);
  });

  it("calculates AC from equipped armor, hand-held shield, dexterity, and magic fields", () => {
    const entity = character("fighter", "fighter", 14);
    const entries = [
      inventory("chain", entity.id, "item_chainmail_068", 1, { kind: "equipped" }),
      inventory("shield", entity.id, "item_shield_071", 1, { kind: "equipped" }, "left_hand")
    ];
    expect(armorClass(entity, entries, catalogs)).toBe(16);
  });

  it("does not grant shield AC when the shield is equipped but not in hand", () => {
    const entity = character("fighter", "fighter", 14);
    const entries = [
      inventory("chain", entity.id, "item_chainmail_068", 1, { kind: "equipped" }),
      inventory("shield", entity.id, "item_shield_071", 1, { kind: "equipped" })
    ];
    expect(armorClass(entity, entries, catalogs)).toBe(15);
  });

  it("warns when class armor proficiencies are exceeded", () => {
    const entity = character("mage", "magic-user", 10);
    const entries = [inventory("chain", entity.id, "item_chainmail_068", 1, { kind: "equipped" })];
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
  location: InventoryLocation,
  handSlot: HandSlot | null = null
): InventoryEntry {
  return {
    id,
    entityId,
    itemTemplateId,
    quantity,
    location,
    handSlot,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function customInventory(
  id: string,
  entityId: string,
  customItem: ItemTemplate,
  quantity: number,
  location: InventoryLocation,
  handSlot: HandSlot | null = null
): InventoryEntry {
  return {
    id,
    entityId,
    customItem,
    quantity,
    location,
    handSlot,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function schemaSnapshot(inventoryEntries: InventoryEntry[]) {
  const starter = createStarterCampaign("schema-test", "Schema Test");
  return {
    ...starter,
    entities: [character("entity", "fighter", 10), character("other", "fighter", 10)],
    inventoryEntries
  };
}
