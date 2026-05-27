import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemTemplate } from "../types";
import { entryItem } from "../lib/rules";
import { useCampaignStore } from "./campaignStore";

describe("campaign inventory item actions", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });
  });

  it("adds filled custom item data without linking to the standard item list", async () => {
    await initializeStore();
    const entityId = "entity-mira";

    await useCampaignStore.getState().addCustomItem({
      entityId,
      item: customItem({
        id: "custom-glass-dagger",
        type: "weapon",
        name: "Glass dagger",
        slotsPerUnit: 0,
        handsRequired: 1,
        gpValue: 15,
        weapon: { damage: "1d4", rangeShort: 10, rangeMedium: 20, rangeLong: 30, qualities: ["fragile"] }
      }),
      quantity: 1,
      location: { kind: "equipped" },
      handSlot: "left_hand"
    });

    const entry = useCampaignStore
      .getState()
      .inventoryEntries.find((candidate) => candidate.customItem?.name === "Glass dagger");

    expect(entry?.itemTemplateId).toBeUndefined();
    expect(entry?.customItem?.weapon?.damage).toBe("1d4");
    expect(entry?.handSlot).toBe("left_hand");
  });

  it("adds a standard-item suggestion as editable custom item data", async () => {
    await initializeStore();
    const { catalogs } = useCampaignStore.getState();

    await useCampaignStore.getState().addCustomItem({
      entityId: "entity-mira",
      item: { ...catalogs.itemsById["item_torch_056"], id: "custom-torch-copy" },
      quantity: 2,
      location: { kind: "equipped" },
      handSlot: "left_hand"
    });

    const entries = useCampaignStore
      .getState()
      .inventoryEntries.filter((candidate) => candidate.customItem?.id === "custom-torch-copy");
    const held = entries.find((candidate) => candidate.handSlot === "left_hand");
    const carried = entries.find((candidate) => candidate.handSlot === null);

    expect(entries).toHaveLength(2);
    expect(held?.itemTemplateId).toBeUndefined();
    expect(held?.customItem?.name).toBe("Torch");
    expect(held?.quantity).toBe(1);
    expect(held?.state?.durationTurnsMax).toBe(6);
    expect(carried?.quantity).toBe(1);
  });

  it("edits a template-linked entry into a custom snapshot", async () => {
    await initializeStore();
    const entry = useCampaignStore.getState().inventoryEntries.find((candidate) => candidate.id === "entry-mira-dagger");
    expect(entry?.itemTemplateId).toBe("item_dagger_079");

    const result = await useCampaignStore.getState().updateInventoryItem({
      entryId: "entry-mira-dagger",
      entityId: "entity-mira",
      item: customItem({
        id: "custom-etched-dagger",
        type: "weapon",
        name: "Etched dagger",
        slotsPerUnit: 0,
        handsRequired: 1,
        weapon: { damage: "1d4+1", rangeShort: 10, rangeMedium: 20, rangeLong: 30, qualities: ["silvered"] }
      }),
      quantity: 1,
      location: { kind: "equipped" },
      handSlot: "right_hand"
    });

    const updated = useCampaignStore.getState().inventoryEntries.find((candidate) => candidate.id === "entry-mira-dagger");

    expect(result.ok).toBe(true);
    expect(updated?.itemTemplateId).toBeUndefined();
    expect(updated?.customItem?.name).toBe("Etched dagger");
    expect(entryItem(updated!, useCampaignStore.getState().catalogs).weapon?.damage).toBe("1d4+1");
  });

  it("splits one hand-required unit from a stack when moved to hand", async () => {
    await initializeStore();

    const result = await useCampaignStore.getState().moveInventoryEntry({
      entryId: "entry-mira-torch",
      entityId: "entity-mira",
      location: { kind: "equipped" },
      handSlot: "left_hand"
    });

    const entries = useCampaignStore.getState().inventoryEntries.filter((entry) => entry.itemTemplateId === "item_torch_056");
    const original = entries.find((entry) => entry.id === "entry-mira-torch");
    const held = entries.find((entry) => entry.id !== "entry-mira-torch" && entry.handSlot === "left_hand");

    expect(result.ok).toBe(true);
    expect(original?.quantity).toBe(2);
    expect(original?.location).toEqual({ kind: "contained", parentEntryId: "entry-mira-backpack" });
    expect(original?.handSlot).toBeNull();
    expect(held?.quantity).toBe(1);
    expect(held?.location).toEqual({ kind: "equipped" });
  });

  it("splits one hand-required unit from a stack when edited into a hand", async () => {
    await initializeStore();
    const { catalogs } = useCampaignStore.getState();

    const result = await useCampaignStore.getState().updateInventoryItem({
      entryId: "entry-mira-torch",
      entityId: "entity-mira",
      item: { ...catalogs.itemsById["item_torch_056"], id: "custom-edited-torch" },
      quantity: 3,
      location: { kind: "equipped" },
      handSlot: "left_hand"
    });

    const torches = useCampaignStore.getState().inventoryEntries.filter((entry) => entry.customItem?.id === "custom-edited-torch");
    const original = torches.find((entry) => entry.id === "entry-mira-torch");
    const held = torches.find((entry) => entry.id !== "entry-mira-torch" && entry.handSlot === "left_hand");

    expect(result.ok).toBe(true);
    expect(original?.quantity).toBe(2);
    expect(original?.location).toEqual({ kind: "contained", parentEntryId: "entry-mira-backpack" });
    expect(original?.handSlot).toBeNull();
    expect(held?.quantity).toBe(1);
    expect(held?.location).toEqual({ kind: "equipped" });
  });

  it("does not split a stack into an occupied hand", async () => {
    await initializeStore();

    const result = await useCampaignStore.getState().moveInventoryEntry({
      entryId: "entry-mira-torch",
      entityId: "entity-borin",
      location: { kind: "equipped" },
      handSlot: "left_hand"
    });

    const torches = useCampaignStore.getState().inventoryEntries.filter((entry) => entry.itemTemplateId === "item_torch_056");
    expect(result.ok).toBe(false);
    expect(torches).toHaveLength(1);
    expect(torches[0].quantity).toBe(3);
  });

  it("splits one lit unit from a stack without making inventory light effective", async () => {
    await initializeStore();

    await useCampaignStore.getState().toggleLight("entry-mira-torch");

    const entries = useCampaignStore.getState().inventoryEntries.filter((entry) => entry.itemTemplateId === "item_torch_056");
    const original = entries.find((entry) => entry.id === "entry-mira-torch");
    const lit = entries.find((entry) => entry.id !== "entry-mira-torch" && entry.state?.isLit);
    const mira = useCampaignStore.getState().summaries().find((summary) => summary.entity.id === "entity-mira");

    expect(original?.quantity).toBe(2);
    expect(original?.state?.isLit).toBe(false);
    expect(lit?.quantity).toBe(1);
    expect(lit?.location).toEqual({ kind: "contained", parentEntryId: "entry-mira-backpack" });
    expect(mira?.activeLights).toHaveLength(0);
  });

  it("burns and consumes a lit torch even when it is not in hand", async () => {
    await initializeStore();
    await useCampaignStore.getState().toggleLight("entry-mira-torch");

    for (let turn = 0; turn < 6; turn += 1) {
      await useCampaignStore.getState().spendTurn();
    }

    const torches = useCampaignStore.getState().inventoryEntries.filter((entry) => entry.itemTemplateId === "item_torch_056");
    expect(torches).toHaveLength(1);
    expect(torches[0].id).toBe("entry-mira-torch");
    expect(torches[0].quantity).toBe(2);
  });

  it("depletes a lantern instead of deleting it when its duration runs out", async () => {
    await initializeStore();
    const addResult = await useCampaignStore.getState().addCatalogItem({
      entityId: "entity-mira",
      itemTemplateId: "item_lantern_031",
      quantity: 1,
      location: { kind: "equipped" },
      handSlot: "left_hand"
    });
    expect(addResult.ok).toBe(true);
    const lantern = useCampaignStore.getState().inventoryEntries.find((entry) => entry.itemTemplateId === "item_lantern_031");
    expect(lantern).toBeDefined();

    await useCampaignStore.getState().updateInventoryEntry({
      ...lantern!,
      state: { ...lantern!.state, isLit: true, durationTurnsUsed: 23, durationTurnsMax: 24 }
    });
    await useCampaignStore.getState().spendTurn();

    const depletedLantern = useCampaignStore.getState().inventoryEntries.find((entry) => entry.id === lantern!.id);
    expect(depletedLantern).toBeDefined();
    expect(depletedLantern?.state?.isLit).toBe(false);
    expect(depletedLantern?.state?.isDepleted).toBe(true);
  });

  it("updates a coin purse with explicit denominations", async () => {
    await initializeStore();

    const result = await useCampaignStore.getState().upsertCoinPurseCoins({
      entityId: "entity-mira",
      purseEntryId: "entry-mira-pouch",
      coins: { pp: 1, gp: 2, sp: 3, cp: 4 }
    });

    const coinEntry = useCampaignStore.getState().inventoryEntries.find((entry) => entry.id === "entry-mira-coins");

    expect(result.ok).toBe(true);
    expect(coinEntry?.quantity).toBe(10);
    expect(coinEntry?.state?.coins).toEqual({ pp: 1, gp: 2, sp: 3, cp: 4 });
  });

  it("removes purse coins at zero without removing 0-slot treasure", async () => {
    await initializeStore();

    const addGem = await useCampaignStore.getState().addCustomItem({
      entityId: "entity-mira",
      item: customItem({
        id: "custom-ruby",
        type: "treasure",
        name: "Ruby",
        slotsPerUnit: 0,
        gpValue: 500,
        treasure: {}
      }),
      quantity: 1,
      location: { kind: "contained", parentEntryId: "entry-mira-pouch" },
      handSlot: null
    });
    const clearCoins = await useCampaignStore.getState().upsertCoinPurseCoins({
      entityId: "entity-mira",
      purseEntryId: "entry-mira-pouch",
      coins: { pp: 0, gp: 0, sp: 0, cp: 0 }
    });

    const entries = useCampaignStore.getState().inventoryEntries;
    const coinEntry = entries.find((entry) => entry.id === "entry-mira-coins");
    const gemEntry = entries.find((entry) => entry.customItem?.id === "custom-ruby");

    expect(addGem.ok).toBe(true);
    expect(clearCoins.ok).toBe(true);
    expect(coinEntry).toBeUndefined();
    expect(gemEntry?.location).toEqual({ kind: "contained", parentEntryId: "entry-mira-pouch" });
  });
});

async function initializeStore() {
  await useCampaignStore.getState().initialize(`store-test-${crypto.randomUUID()}`);
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

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    }
  };
}
