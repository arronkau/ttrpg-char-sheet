import type { Campaign, Entity, HandSlot, InventoryEntry, InventoryLocation, ItemTemplate } from "../types";
import { classNameToId } from "./catalogs";

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
    dwarf: "entity-borin",
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
      id: entityIds.dwarf,
      type: "character",
      name: "Borin",
      playerName: "Player 2",
      classId: classNameToId("Dwarf"),
      xp: 2400,
      abilities: {
        strength: 15,
        intelligence: 9,
        wisdom: 10,
        dexterity: 11,
        constitution: 16,
        charisma: 10
      },
      hp: { currentHp: 9, maxHp: 9 },
      alignment: "lawful",
      languages: ["Common", "Dwarvish", "Alignment"],
      notes: { publicNotes: "Carries the spare rope." },
      active: true,
      sortOrder: 20,
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

  const inventoryEntries: InventoryEntry[] = [
    entry("entry-mira-backpack", entityIds.mage, "item_backpack_001", 1, { kind: "equipped" }, null, createdAt),
    entry("entry-mira-torch", entityIds.mage, "item_torch_056", 3, { kind: "contained", parentEntryId: "entry-mira-backpack" }, null, createdAt),
    entry("entry-mira-dagger", entityIds.mage, "item_dagger_079", 1, { kind: "equipped" }, "right_hand", createdAt),
    entry("entry-mira-pouch", entityIds.mage, "item_belt_pouch_005", 1, { kind: "equipped" }, null, createdAt),
    {
      id: "entry-mira-coins",
      entityId: entityIds.mage,
      customItem: createTreasureItem("treasure-mira-coins", "Coins", "Pocket money in Mira's belt pouch.", 1, 1),
      quantity: 35,
      location: { kind: "contained", parentEntryId: "entry-mira-pouch" },
      handSlot: null,
      state: { coins: { pp: 0, gp: 35, sp: 0, cp: 0 } },
      createdAt,
      updatedAt: createdAt
    },
    entry("entry-borin-chain", entityIds.dwarf, "item_chainmail_068", 1, { kind: "equipped" }, null, createdAt),
    entry("entry-borin-shield", entityIds.dwarf, "item_shield_071", 1, { kind: "equipped" }, "left_hand", createdAt),
    entry("entry-borin-sword", entityIds.dwarf, "item_sword_096", 1, { kind: "equipped" }, "right_hand", createdAt),
    entry("entry-borin-rope", entityIds.dwarf, "item_rope_50_047", 1, { kind: "equipped" }, null, createdAt),
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
  return {
    id,
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
