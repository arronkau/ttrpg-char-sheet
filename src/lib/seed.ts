import type { Campaign, CoinBreakdown, Entity, HandSlot, InventoryEntry, InventoryLocation, ItemTemplate } from "../types";
import { classNameToId } from "./catalogs";
import { withInventoryRecordType } from "./inventoryRecordTypes";

export type CampaignSnapshot = {
  campaign: Campaign;
  entities: Entity[];
  inventoryEntries: InventoryEntry[];
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeCampaignId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  return `${slug || "campaign"}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createStarterCampaign(id: string, name = "Arden Vul Table"): CampaignSnapshot {
  const createdAt = nowIso();
  const entityIds = {
    mage: "entity-mira",
    fighter: "entity-borin",
    cleric: "entity-selric",
    thief: "entity-pip",
    treasure: "entity-unassigned-treasure"
  };

  const campaign: Campaign = {
    id,
    name,
    createdAt,
    updatedAt: createdAt,
    settings: {
      viewMode: "gm",
      encumbranceMethod: "slots"
    }
  };

  const entities: Entity[] = [
    {
      id: entityIds.mage,
      type: "character",
      name: "Mira",
      playerName: "Player 1",
      classId: classNameToId("Magic-User"),
      xp: 0,
      abilities: {
        strength: 8,
        intelligence: 16,
        wisdom: 11,
        dexterity: 14,
        constitution: 10,
        charisma: 9
      },
      hp: { currentHp: 4, maxHp: 4 },
      alignment: "neutral",
      languages: ["Common", "Alignment"],
      spellcasting: {
        spellbookSpellIds: ["read-magic", "shield", "sleep"].filter(Boolean),
        memorizedSpells: []
      },
      notes: { publicNotes: "Keeps the map dry." },
      active: true,
      sortOrder: 10,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: entityIds.fighter,
      type: "character",
      name: "Borin",
      playerName: "Player 2",
      classId: classNameToId("Fighter"),
      xp: 2400,
      abilities: {
        strength: 16,
        intelligence: 9,
        wisdom: 10,
        dexterity: 11,
        constitution: 15,
        charisma: 10
      },
      hp: { currentHp: 13, maxHp: 13 },
      alignment: "lawful",
      languages: ["Common", "Alignment"],
      notes: { publicNotes: "Holds the line. Carries the spare rope." },
      active: true,
      sortOrder: 20,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: entityIds.cleric,
      type: "character",
      name: "Selric",
      playerName: "Player 3",
      classId: classNameToId("Cleric"),
      xp: 1500,
      abilities: {
        strength: 13,
        intelligence: 10,
        wisdom: 15,
        dexterity: 9,
        constitution: 13,
        charisma: 11
      },
      hp: { currentHp: 8, maxHp: 8 },
      alignment: "lawful",
      languages: ["Common", "Alignment"],
      notes: { publicNotes: "Tends the wounded and hates the undead." },
      active: true,
      sortOrder: 30,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: entityIds.thief,
      type: "character",
      name: "Pip",
      playerName: "Player 4",
      classId: classNameToId("Thief"),
      xp: 1200,
      abilities: {
        strength: 9,
        intelligence: 12,
        wisdom: 11,
        dexterity: 16,
        constitution: 10,
        charisma: 13
      },
      hp: { currentHp: 5, maxHp: 5 },
      alignment: "neutral",
      languages: ["Common", "Alignment"],
      notes: { publicNotes: "Scouts ahead and pockets the shiny bits." },
      active: true,
      sortOrder: 40,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: entityIds.treasure,
      type: "storage",
      name: "Unassigned Treasure",
      active: true,
      sortOrder: 90,
      createdAt,
      updatedAt: createdAt
    }
  ];

  const contained = (parentEntryId: string): InventoryLocation => ({ kind: "contained", parentEntryId });

  const inventoryEntries: InventoryEntry[] = [
    // --- Mira (Magic-User): no armor, a dagger, and a backpack of light gear ---
    entry("entry-mira-backpack", entityIds.mage, "item_backpack_001", 1, { kind: "equipped" }, null, createdAt),
    entry("entry-mira-torch", entityIds.mage, "item_torch_056", 3, contained("entry-mira-backpack"), null, createdAt),
    entry("entry-mira-rations", entityIds.mage, "item_ration_standard_046", 3, contained("entry-mira-backpack"), null, createdAt),
    entry("entry-mira-waterskin", entityIds.mage, "item_waterskin_059", 1, contained("entry-mira-backpack"), null, createdAt),
    entry("entry-mira-tinderbox", entityIds.mage, "item_tinder_box_flint_steel_055", 1, contained("entry-mira-backpack"), null, createdAt),
    entry("entry-mira-dagger", entityIds.mage, "item_dagger_079", 1, { kind: "equipped" }, "right_hand", createdAt),
    entry("entry-mira-pouch", entityIds.mage, "item_belt_pouch_005", 1, { kind: "equipped" }, null, createdAt),
    {
      id: "entry-mira-coins",
      recordType: "coins",
      entityId: entityIds.mage,
      customItem: createTreasureItem("treasure-mira-coins", "Coins", "Pocket money in Mira's belt pouch.", 1, 1),
      quantity: 35,
      location: contained("entry-mira-pouch"),
      handSlot: null,
      state: { coins: { pp: 0, gp: 35, sp: 0, cp: 0 } },
      createdAt,
      updatedAt: createdAt
    },

    // --- Borin (Fighter): chainmail, shield + sword in hand, helmet, kit, purse ---
    entry("entry-borin-chain", entityIds.fighter, "item_chainmail_068", 1, { kind: "equipped" }, null, createdAt),
    entry("entry-borin-helmet", entityIds.fighter, "item_helmet_072", 1, { kind: "equipped" }, null, createdAt),
    entry("entry-borin-shield", entityIds.fighter, "item_shield_071", 1, { kind: "equipped" }, "left_hand", createdAt),
    entry("entry-borin-sword", entityIds.fighter, "item_sword_096", 1, { kind: "equipped" }, "right_hand", createdAt),
    entry("entry-borin-handaxe", entityIds.fighter, "item_hand_axe_082", 1, { kind: "equipped" }, null, createdAt),
    entry("entry-borin-rope", entityIds.fighter, "item_rope_50_047", 1, { kind: "equipped" }, null, createdAt),
    entry("entry-borin-backpack", entityIds.fighter, "item_backpack_001", 1, { kind: "equipped" }, null, createdAt),
    entry("entry-borin-rations", entityIds.fighter, "item_ration_standard_046", 3, contained("entry-borin-backpack"), null, createdAt),
    entry("entry-borin-waterskin", entityIds.fighter, "item_waterskin_059", 1, contained("entry-borin-backpack"), null, createdAt),
    entry("entry-borin-tinderbox", entityIds.fighter, "item_tinder_box_flint_steel_055", 1, contained("entry-borin-backpack"), null, createdAt),
    entry("entry-borin-spikes", entityIds.fighter, "item_iron_spike_029", 6, contained("entry-borin-backpack"), null, createdAt),
    entry("entry-borin-pouch", entityIds.fighter, "item_belt_pouch_005", 1, { kind: "equipped" }, null, createdAt),
    coinEntry("entry-borin-coins", entityIds.fighter, "entry-borin-pouch", { pp: 0, gp: 50, sp: 20, cp: 0 }, createdAt),

    // --- Selric (Cleric): chainmail, shield + mace, holy symbol, healing kit ---
    entry("entry-selric-chain", entityIds.cleric, "item_chainmail_068", 1, { kind: "equipped" }, null, createdAt),
    entry("entry-selric-shield", entityIds.cleric, "item_shield_071", 1, { kind: "equipped" }, "left_hand", createdAt),
    entry("entry-selric-mace", entityIds.cleric, "item_mace_087", 1, { kind: "equipped" }, "right_hand", createdAt),
    entry("entry-selric-holysymbol", entityIds.cleric, "item_holy_symbol_024", 1, { kind: "equipped" }, null, createdAt),
    entry("entry-selric-holywater", entityIds.cleric, "item_holy_water_vial_027", 2, { kind: "equipped" }, null, createdAt),
    entry("entry-selric-backpack", entityIds.cleric, "item_backpack_001", 1, { kind: "equipped" }, null, createdAt),
    entry("entry-selric-rations", entityIds.cleric, "item_ration_standard_046", 3, contained("entry-selric-backpack"), null, createdAt),
    entry("entry-selric-waterskin", entityIds.cleric, "item_waterskin_059", 1, contained("entry-selric-backpack"), null, createdAt),
    entry("entry-selric-tinderbox", entityIds.cleric, "item_tinder_box_flint_steel_055", 1, contained("entry-selric-backpack"), null, createdAt),
    entry("entry-selric-candles", entityIds.cleric, "item_candle_011", 6, contained("entry-selric-backpack"), null, createdAt),
    entry("entry-selric-pouch", entityIds.cleric, "item_belt_pouch_005", 1, { kind: "equipped" }, null, createdAt),
    coinEntry("entry-selric-coins", entityIds.cleric, "entry-selric-pouch", { pp: 0, gp: 40, sp: 10, cp: 0 }, createdAt),

    // --- Pip (Thief): leather, short sword + sling, thieves' tools, climbing kit ---
    entry("entry-pip-leather", entityIds.thief, "item_leather_065", 1, { kind: "equipped" }, null, createdAt),
    entry("entry-pip-sword", entityIds.thief, "item_short_sword_092", 1, { kind: "equipped" }, "right_hand", createdAt),
    entry("entry-pip-sling", entityIds.thief, "item_sling_093", 1, { kind: "equipped" }, null, createdAt),
    entry("entry-pip-tools", entityIds.thief, "item_thieves_tools_054", 1, { kind: "equipped" }, null, createdAt),
    entry("entry-pip-rope", entityIds.thief, "item_rope_50_047", 1, { kind: "equipped" }, null, createdAt),
    entry("entry-pip-hook", entityIds.thief, "item_grappling_hook_022", 1, { kind: "equipped" }, null, createdAt),
    entry("entry-pip-oil", entityIds.thief, "item_oil_1_flask_041", 2, { kind: "equipped" }, null, createdAt),
    entry("entry-pip-backpack", entityIds.thief, "item_backpack_001", 1, { kind: "equipped" }, null, createdAt),
    entry("entry-pip-candles", entityIds.thief, "item_candle_011", 3, contained("entry-pip-backpack"), null, createdAt),
    entry("entry-pip-tinderbox", entityIds.thief, "item_tinder_box_flint_steel_055", 1, contained("entry-pip-backpack"), null, createdAt),
    entry("entry-pip-rations", entityIds.thief, "item_ration_standard_046", 2, contained("entry-pip-backpack"), null, createdAt),
    entry("entry-pip-waterskin", entityIds.thief, "item_waterskin_059", 1, contained("entry-pip-backpack"), null, createdAt),
    entry("entry-pip-pouch", entityIds.thief, "item_belt_pouch_005", 1, { kind: "equipped" }, null, createdAt),
    coinEntry("entry-pip-coins", entityIds.thief, "entry-pip-pouch", { pp: 0, gp: 25, sp: 30, cp: 0 }, createdAt),
    {
      id: "entry-pip-moonstone",
      entityId: entityIds.thief,
      customItem: createTreasureItem("treasure-pip-moonstone", "Moonstone", "A small polished moonstone Pip has been admiring.", 50, 0),
      quantity: 1,
      location: contained("entry-pip-pouch"),
      handSlot: null,
      createdAt,
      updatedAt: createdAt
    },

    // --- Party loot, unassigned ---
    {
      id: "entry-loot-gems",
      entityId: entityIds.treasure,
      customItem: createTreasureItem("treasure-rubies", "Ruby", "A cut ruby from a brass coffer.", 500, 0),
      quantity: 2,
      location: { kind: "equipped" },
      handSlot: null,
      createdAt,
      updatedAt: createdAt
    }
  ];

  return { campaign, entities, inventoryEntries };
}

export function createTreasureItem(
  id: string,
  name: string,
  description: string,
  gpValue: number | null,
  slotsPerUnit: number
): ItemTemplate {
  return withInventoryRecordType({
    id,
    recordType: "treasure",
    type: "treasure",
    identified: true,
    name,
    description,
    quantity: 1,
    slotsPerUnit,
    stackSize: slotsPerUnit === 0 ? null : 100,
    handsRequired: 0,
    emitsLight: false,
    lightRadiusFeet: null,
    cursed: false,
    curseDescription: null,
    gpValue,
    treasure: {}
  });
}

function coinEntry(
  id: string,
  entityId: string,
  parentEntryId: string,
  coins: CoinBreakdown,
  timestamp: string
): InventoryEntry {
  return {
    id,
    recordType: "coins",
    entityId,
    customItem: createTreasureItem(`treasure-${id}`, "Coins", "Coins in the belt pouch.", 1, 1),
    quantity: coins.pp + coins.gp + coins.sp + coins.cp,
    location: { kind: "contained", parentEntryId },
    handSlot: null,
    state: { coins },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function entry(
  id: string,
  entityId: string,
  itemTemplateId: string,
  quantity: number,
  location: InventoryLocation,
  handSlot: HandSlot | null,
  timestamp: string
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
