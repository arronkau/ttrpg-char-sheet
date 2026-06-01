import { describe, expect, it } from "vitest";
import type { Entity, HandSlot, InventoryEntry, InventoryLocation, ItemTemplate } from "../types";
import { catalogs } from "./catalogs";
import { inventoryRecordTypeForEntry, inventoryRecordTypeForItem } from "./inventoryRecordTypes";
import { isCurrentCampaignSnapshot, validateInventoryPlacement } from "./inventoryIntegrity";
import {
  armorClass,
  buildInventoryTree,
  classHitDice,
  classRestrictionWarnings,
  classSkillRows,
  coinBreakdownForEntry,
  coinTotal,
  entityHandOccupancy,
  entityLoadBreakdown,
  entryItem,
  entrySlots,
  expertisePointsForLevel,
  formatEncounterMovement,
  formatExplorationMovement,
  formatOverlandMovement,
  handSlotForLocation,
  isActiveLight,
  isZeroSlotTreasureEntry,
  levelForXp,
  movementForSlots,
  splitInventoryEntry,
  spendLightTurn,
  spendLightTurnPatch,
  stackSlots,
  summarizeEntity,
  turnsRemaining,
  unspentSkillPoints,
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

  it("keeps template-linked entries readable without snapshot migration", () => {
    const entry = inventory("torch", "entity", "item_torch_056", 3, { kind: "equipped" });
    expect(entryItem(entry, catalogs).name).toBe("Torch");
    expect(entrySlots(entry, catalogs)).toBe(1);
  });

  it("calculates coin slots from explicit denominations and legacy coin stacks", () => {
    const explicitCoins = customInventory("coins", "entity", createTreasureItem("coins", "Coins", "Loose coins", 1, 1), 999, {
      kind: "contained",
      parentEntryId: "pouch"
    });
    explicitCoins.state = { coins: { pp: 2, gp: 50, sp: 30, cp: 20 } };
    const legacyCoins = customInventory("legacy-coins", "entity", createTreasureItem("legacy-coins", "Coins", "Old coins", 1, 1), 35, {
      kind: "contained",
      parentEntryId: "pouch"
    });

    expect(coinTotal(coinBreakdownForEntry(explicitCoins, catalogs)!)).toBe(102);
    expect(entrySlots(explicitCoins, catalogs)).toBe(2);
    expect(inventoryRecordTypeForEntry(explicitCoins, entryItem(explicitCoins, catalogs))).toBe("coins");
    expect(coinBreakdownForEntry(legacyCoins, catalogs)).toEqual({ pp: 0, gp: 35, sp: 0, cp: 0 });
    expect(inventoryRecordTypeForEntry(legacyCoins, entryItem(legacyCoins, catalogs))).toBe("coins");
  });

  it("keeps legacy custom items without recordType classifiable during migration", () => {
    const legacyGear = customItem({ type: "gear", recordType: undefined });
    const legacyTreasure = createTreasureItem("gem", "Gem", "Small gem", 50, 0);
    delete legacyTreasure.recordType;

    expect(inventoryRecordTypeForItem(legacyGear)).toBe("equipment");
    expect(inventoryRecordTypeForEntry(customInventory("gear", "entity", legacyGear, 1, { kind: "equipped" }), legacyGear)).toBe("equipment");
    expect(inventoryRecordTypeForItem(legacyTreasure)).toBe("treasure");
  });

  it("maps carried slots to movement thresholds", () => {
    expect(movementForSlots(5).movementExploration).toBe(120);
    expect(movementForSlots(6).movementEncounter).toBe(30);
    expect(movementForSlots(21).overloaded).toBe(true);
  });

  it("uses mount and vehicle logistics for capacity and movement", () => {
    const mule = {
      id: "mule",
      type: "mount",
      name: "Mule",
      active: true,
      sortOrder: 1,
      logistics: {
        capacitySlots: 2,
        movementExploration: 180,
        movementEncounter: 60
      },
      createdAt: timestamp,
      updatedAt: timestamp
    } satisfies Entity;
    const entries = [
      inventory("backpack", mule.id, "item_backpack_001", 1, { kind: "equipped" }),
      inventory("chain", mule.id, "item_chainmail_068", 1, { kind: "equipped" })
    ];

    const summary = summarizeEntity(mule, entries, catalogs, "gm");

    expect(summary.capacitySlots).toBe(2);
    expect(summary.movementExploration).toBe(180);
    expect(summary.movementEncounter).toBe(60);
    expect(summary.overloaded).toBe(true);
    expect(summary.warnings.some((warning) => warning.message.includes("3/2 slots"))).toBe(true);
  });
});

describe("inventory tree behavior", () => {
  it("honors manual sort order for sibling entries", () => {
    const entries = [
      { ...inventory("torch", "entity", "item_torch_056", 1, { kind: "equipped" }), sortOrder: 30 },
      { ...inventory("pack", "entity", "item_backpack_001", 1, { kind: "equipped" }), sortOrder: 20 },
      { ...inventory("dagger", "entity", "item_dagger_079", 1, { kind: "equipped" }), sortOrder: 10 }
    ];

    const tree = buildInventoryTree(entries, catalogs);

    expect(tree.byEntityId.entity.map((node) => node.entry.id)).toEqual(["dagger", "pack", "torch"]);
  });

  it("keeps legacy sibling ordering when sort order is absent", () => {
    const entries = [
      inventory("torch", "entity", "item_torch_056", 1, { kind: "equipped" }),
      inventory("pack", "entity", "item_backpack_001", 1, { kind: "equipped" }),
      inventory("dagger", "entity", "item_dagger_079", 1, { kind: "equipped" })
    ];

    const tree = buildInventoryTree(entries, catalogs);

    expect(tree.byEntityId.entity.map((node) => node.entry.id)).toEqual(["pack", "dagger", "torch"]);
  });

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

  it("tracks coin purse capacity separately from 0-slot treasure", () => {
    const coins = customInventory("coins", "entity", createTreasureItem("coins", "Coins", "Loose coins", 1, 1), 101, {
      kind: "contained",
      parentEntryId: "pouch"
    });
    coins.state = { coins: { pp: 1, gp: 100, sp: 0, cp: 0 } };
    const gem = customInventory("gem", "entity", createTreasureItem("gem", "Ruby", "Small cut ruby", 500, 0), 1, {
      kind: "contained",
      parentEntryId: "pouch"
    });
    const entries = [inventory("pouch", "entity", "item_belt_pouch_005", 1, { kind: "equipped" }), coins, gem];

    const tree = buildInventoryTree(entries, catalogs);
    const pouch = tree.allNodes.find((node) => node.entry.id === "pouch");

    expect(pouch?.coinCapacity).toBe(100);
    expect(pouch?.usedCoins).toBe(101);
    expect(pouch?.overCoinCapacity).toBe(true);
    expect(pouch?.usedSlots).toBe(0);
    expect(pouch?.overCapacity).toBe(false);
    expect(isZeroSlotTreasureEntry(gem, catalogs)).toBe(true);
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

  it("warns when a coin purse carries more than 100 coins", () => {
    const entity = character("fighter", "fighter", 10);
    const coins = customInventory("coins", entity.id, createTreasureItem("coins", "Coins", "Loose coins", 1, 1), 101, {
      kind: "contained",
      parentEntryId: "pouch"
    });
    coins.state = { coins: { pp: 0, gp: 100, sp: 1, cp: 0 } };
    const entries = [inventory("pouch", entity.id, "item_belt_pouch_005", 1, { kind: "equipped" }), coins];

    const summary = summarizeEntity(entity, entries, catalogs, "gm");

    expect(summary.warnings.some((warning) => warning.message.includes("101/100 coins"))).toBe(true);
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

  it("does not warn when equipped hand-use items are ready but not held", () => {
    const entity = character("fighter", "fighter", 10);
    const entries = [inventory("sack", entity.id, "item_sack_048", 1, { kind: "equipped" })];
    const summary = summarizeEntity(entity, entries, catalogs, "gm");
    expect(summary.warnings.some((warning) => warning.message.includes("requires 1 hand"))).toBe(false);
  });

  it("warns when a held stack needs more hands than its assigned hand slot provides", () => {
    const entity = character("fighter", "fighter", 10);
    const entries = [inventory("torch-stack", entity.id, "item_torch_056", 2, { kind: "equipped" }, "left_hand")];
    const summary = summarizeEntity(entity, entries, catalogs, "gm");
    expect(summary.warnings.some((warning) => warning.message.includes("stack needs 2 hands"))).toBe(true);
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
    const result = spendLightTurn(handTorch, catalogs);
    expect(result?.disposition).toBe("consumed");
    expect(result?.entry.state?.durationTurnsUsed).toBe(6);
  });

  it("burns lit timed items even when they are not held in hand", () => {
    const packedTorch = inventory("packed-torch", "entity", "item_torch_056", 1, { kind: "equipped" });
    packedTorch.state = { isLit: true, durationTurnsUsed: 2, durationTurnsMax: 6 };

    expect(isActiveLight(packedTorch, catalogs)).toBe(false);
    const next = spendLightTurnPatch(packedTorch, catalogs);
    expect(next?.state?.isLit).toBe(true);
    expect(next?.state?.durationTurnsUsed).toBe(3);
  });

  it("marks non-consumed lights depleted when their duration runs out", () => {
    const lantern = inventory("lantern", "entity", "item_lantern_031", 1, { kind: "equipped" }, "left_hand");
    lantern.state = { isLit: true, durationTurnsUsed: 23, durationTurnsMax: 24 };

    const result = spendLightTurn(lantern, catalogs);
    expect(result?.disposition).toBe("updated");
    expect(result?.entry.state?.isLit).toBe(false);
    expect(result?.entry.state?.isDepleted).toBe(true);
  });

  it("uses custom light fields for active light tracking", () => {
    const lantern = customInventory(
      "lantern",
      "entity",
      customItem({
        id: "custom-lantern",
        name: "Blue lantern",
        handsRequired: 1,
        emitsLight: true,
        lightRadiusFeet: 40,
        gear: {
          gearKind: "misc",
          usesMax: null,
          usesRemaining: null,
          consumedOnUse: false,
          durationTurnsMax: 8,
          durationTurnsUsed: 0,
          durationDescription: null,
          containsSpells: false,
          spellData: null,
          language: null,
          readable: null,
          deciphered: null,
          rulesNote: null
        }
      }),
      1,
      { kind: "equipped" },
      "left_hand"
    );
    lantern.state = { isLit: true, durationTurnsUsed: 2, durationTurnsMax: 8 };

    expect(isActiveLight(lantern, catalogs)).toBe(true);
    expect(turnsRemaining(lantern, lantern.customItem!)).toBe(6);
  });
});

describe("character derivations", () => {
  it("calculates level from class XP tables", () => {
    expect(levelForXp(catalogs.classesById["dwarf"], 2400)).toBe(2);
  });

  it("formats movement for character sheet display", () => {
    expect(formatEncounterMovement(40)).toBe("40'");
    expect(formatExplorationMovement(120)).toBe("120'");
    expect(formatOverlandMovement(120)).toBe("24 mi");
  });

  it("uses current level hit dice with class hit die fallback", () => {
    expect(classHitDice(catalogs.classesById["dwarf"], 2400)).toBe("2d8");
    expect(classHitDice(catalogs.classesById["dwarf"], undefined)).toBe("1d8");
  });

  it("builds skill rows from defaults and class-level overrides", () => {
    const magicUserRows = classSkillRows(catalogs.classesById["magic-user"], 1);
    expect(magicUserRows.find((row) => row.id === "listen_at_doors")?.baseValue).toBe("1-in-6");
    expect(magicUserRows.find((row) => row.id === "move_silently")?.baseValue).toBe("1-in-6");
    expect(magicUserRows.find((row) => row.id === "search_secret_doors")?.baseValue).toBe("1-in-6");

    const thiefRows = classSkillRows(catalogs.classesById["thief"], 3);
    expect(thiefRows.find((row) => row.id === "listen_at_doors")?.baseValue).toBe("1-3");
    expect(thiefRows.find((row) => row.id === "move_silently")?.baseValue).toBe("30%");
  });

  it("calculates expertise points, unspent points, and final skill values", () => {
    const thief = character("thief", "thief", 10);
    thief.skills = {
      skillPointsEnabled: true,
      allocatedPoints: {
        move_silently: 2,
        listen_at_doors: 1
      }
    };

    expect(expertisePointsForLevel(catalogs.classesById["thief"], 3)).toBe(10);
    expect(unspentSkillPoints(thief, catalogs.classesById["thief"], 3)).toBe(7);

    const rows = classSkillRows(catalogs.classesById["thief"], 3, thief.skills.allocatedPoints);
    expect(rows.find((row) => row.id === "move_silently")?.finalValue).toBe("40%");
    expect(rows.find((row) => row.id === "listen_at_doors")?.finalValue).toBe("1-4");
  });

  it("calculates AC from equipped armor, hand-held shield, dexterity, and magic fields", () => {
    const entity = character("fighter", "fighter", 14);
    const entries = [
      inventory("chain", entity.id, "item_chainmail_068", 1, { kind: "equipped" }),
      inventory("shield", entity.id, "item_shield_071", 1, { kind: "equipped" }, "left_hand")
    ];
    expect(armorClass(entity, entries, catalogs)).toBe(16);
  });

  it("uses custom armor, hand, and container fields in derived rules", () => {
    const entity = character("fighter", "fighter", 10);
    const entries = [
      customInventory(
        "brigandine",
        entity.id,
        customItem({
          id: "custom-brigandine",
          type: "armor",
          name: "Brigandine",
          slotsPerUnit: 2,
          armor: { armorType: "armor", baseAcAscending: 14, acBonus: null, magicAcBonus: null }
        }),
        1,
        { kind: "equipped" }
      ),
      customInventory(
        "buckler",
        entity.id,
        customItem({
          id: "custom-buckler",
          type: "armor",
          name: "Buckler",
          armor: { armorType: "shield", baseAcAscending: null, acBonus: 2, magicAcBonus: null }
        }),
        1,
        { kind: "equipped" },
        "left_hand"
      ),
      customInventory(
        "satchel",
        entity.id,
        customItem({
          id: "custom-satchel",
          type: "container",
          name: "Satchel",
          slotsPerUnit: 1,
          container: { capacitySlots: 1, canBeStowed: true, slotsWhenStowed: 1, loadCategory: "stowed" }
        }),
        1,
        { kind: "equipped" }
      ),
      inventory("chain", entity.id, "item_chainmail_068", 1, { kind: "contained", parentEntryId: "satchel" })
    ];

    const tree = buildInventoryTree(entries, catalogs);
    const satchel = tree.allNodes.find((node) => node.entry.id === "satchel");

    expect(armorClass(entity, entries, catalogs)).toBe(16);
    expect(satchel?.capacitySlots).toBe(1);
    expect(satchel?.overCapacity).toBe(true);
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

function customItem(overrides: Partial<ItemTemplate>): ItemTemplate {
  return {
    id: "custom-item",
    type: "gear",
    identified: true,
    name: "Custom item",
    description: "",
    quantity: 1,
    slotsPerUnit: 0,
    stackSize: null,
    handsRequired: 0,
    emitsLight: false,
    lightRadiusFeet: null,
    cursed: false,
    curseDescription: null,
    gpValue: null,
    ...overrides
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
