import type {
  Catalogs,
  ClassDefinition,
  CoinBreakdown,
  ContainerLoadCategory,
  Entity,
  EntitySummary,
  HandSlot,
  InventoryEntry,
  InventoryLocation,
  InventoryNode,
  InventoryTree,
  ItemTemplate,
  RestrictionWarning,
  ViewMode
} from "../types";
import { inventoryParentEntryId, isInventoryLocation } from "./inventoryIntegrity";

export const EMPTY_ABILITIES = {
  strength: 10,
  intelligence: 10,
  wisdom: 10,
  dexterity: 10,
  constitution: 10,
  charisma: 10
};

const ENCUMBRANCE_THRESHOLDS = [
  { max: 5, movementExploration: 120, movementEncounter: 40, label: "Unencumbered" },
  { max: 10, movementExploration: 90, movementEncounter: 30, label: "Light" },
  { max: 15, movementExploration: 60, movementEncounter: 20, label: "Heavy" },
  { max: 20, movementExploration: 30, movementEncounter: 10, label: "Burdened" }
];

const COIN_DENOMINATIONS: Array<keyof CoinBreakdown> = ["pp", "gp", "sp", "cp"];

export type EntityLoadBreakdown = {
  equippedSlots: number;
  stowedSlots: number;
  carriedSlots: number;
};

export type HandValidationResult =
  | { ok: true }
  | { ok: false; blockers: InventoryEntry[] };

export type InventoryConsumptionEvent = {
  type: "itemConsumed" | "itemDepleted";
  entryId: string;
  itemName: string;
  reason: "duration";
};

export type LightTurnSpendResult =
  | { disposition: "updated"; entry: InventoryEntry; event?: InventoryConsumptionEvent }
  | { disposition: "consumed"; entry: InventoryEntry; event: InventoryConsumptionEvent };

export function abilityModifier(score: number | undefined): number {
  const value = score ?? 10;
  if (value <= 3) return -3;
  if (value <= 5) return -2;
  if (value <= 8) return -1;
  if (value <= 12) return 0;
  if (value <= 15) return 1;
  if (value <= 17) return 2;
  return 3;
}

export function levelForXp(classDef: ClassDefinition | undefined, xp: number | undefined): number | undefined {
  if (!classDef) return undefined;
  const currentXp = xp ?? 0;
  const level = [...classDef.levels]
    .sort((a, b) => a.xp_required - b.xp_required)
    .filter((candidate) => candidate.xp_required <= currentXp)
    .at(-1);
  return level?.level ?? classDef.levels[0]?.level;
}

export function xpForNextLevel(classDef: ClassDefinition | undefined, xp: number | undefined): number | null {
  if (!classDef) return null;
  const currentXp = xp ?? 0;
  const next = [...classDef.levels]
    .sort((a, b) => a.xp_required - b.xp_required)
    .find((candidate) => candidate.xp_required > currentXp);
  return next?.xp_required ?? null;
}

export function classLevelData(classDef: ClassDefinition | undefined, xp: number | undefined) {
  const level = levelForXp(classDef, xp);
  return classDef?.levels.find((candidate) => candidate.level === level);
}

export function entryItem(entry: InventoryEntry, catalogs: Catalogs): ItemTemplate {
  if (entry.customItem) return entry.customItem;
  if (entry.itemTemplateId && catalogs.itemsById[entry.itemTemplateId]) return catalogs.itemsById[entry.itemTemplateId];
  return createMissingItem(entry.itemTemplateId ?? "missing-item");
}

export function visibleItem(item: ItemTemplate, mode: ViewMode): ItemTemplate {
  if (mode !== "gm" || item.identified || !item.secretDetails) return item;
  return {
    ...item,
    ...item.secretDetails.item,
    weapon: item.weapon || item.secretDetails.weapon ? { ...item.weapon, ...item.secretDetails.weapon } : undefined,
    armor: item.armor || item.secretDetails.armor ? { ...item.armor, ...item.secretDetails.armor } : undefined,
    gear: item.gear || item.secretDetails.gear ? { ...item.gear, ...item.secretDetails.gear } : undefined,
    container:
      item.container || item.secretDetails.container ? { ...item.container, ...item.secretDetails.container } : undefined,
    treasure: item.treasure || item.secretDetails.treasure ? { ...item.treasure, ...item.secretDetails.treasure } : undefined
  } as ItemTemplate;
}

export function displayName(entry: InventoryEntry, catalogs: Catalogs, mode: ViewMode): string {
  const item = visibleItem(entryItem(entry, catalogs), mode);
  return entry.state?.customName || item.name;
}

export function stackSlots(quantity: number, slotsPerUnit: number, stackSize?: number | null): number {
  if (quantity <= 0 || slotsPerUnit <= 0) return 0;
  if (stackSize && stackSize > 1) return Math.ceil(quantity / stackSize) * slotsPerUnit;
  return quantity * slotsPerUnit;
}

export function normalizeCoins(coins: Partial<CoinBreakdown> | null | undefined): CoinBreakdown {
  return {
    pp: normalizeCoinCount(coins?.pp),
    gp: normalizeCoinCount(coins?.gp),
    sp: normalizeCoinCount(coins?.sp),
    cp: normalizeCoinCount(coins?.cp)
  };
}

export function coinTotal(coins: CoinBreakdown): number {
  return COIN_DENOMINATIONS.reduce((total, denomination) => total + coins[denomination], 0);
}

export function coinBreakdownForEntry(entry: InventoryEntry, catalogs: Catalogs): CoinBreakdown | null {
  if (entry.state?.coins) return normalizeCoins(entry.state.coins);
  if (!isLegacyCoinEntry(entry, catalogs)) return null;
  return { pp: 0, gp: normalizeCoinCount(entry.quantity), sp: 0, cp: 0 };
}

export function isCoinEntry(entry: InventoryEntry, catalogs: Catalogs): boolean {
  return coinBreakdownForEntry(entry, catalogs) !== null;
}

export function isCoinPurseItem(item: ItemTemplate): boolean {
  return item.type === "container" && item.container?.coinCapacity !== undefined;
}

export function isCoinPurseEntry(entry: InventoryEntry, catalogs: Catalogs): boolean {
  return isCoinPurseItem(entryItem(entry, catalogs));
}

export function isZeroSlotTreasureEntry(entry: InventoryEntry, catalogs: Catalogs): boolean {
  const item = entryItem(entry, catalogs);
  return item.type === "treasure" && !isCoinEntry(entry, catalogs) && entrySlots(entry, catalogs) === 0;
}

export function parentEntryId(entry: InventoryEntry): string | null {
  return inventoryParentEntryId(entry);
}

export function isHandSlot(slot: HandSlot | null | undefined): slot is HandSlot {
  return slot === "left_hand" || slot === "right_hand" || slot === "both_hands";
}

export function entryHandSlot(entry: InventoryEntry): HandSlot | null {
  return isInventoryLocation(entry.location) && entry.location.kind === "equipped" ? entry.handSlot ?? null : null;
}

export function isInUseHandEntry(entry: InventoryEntry): boolean {
  return isHandSlot(entryHandSlot(entry));
}

export function entrySlots(entry: InventoryEntry, catalogs: Catalogs): number {
  const item = entryItem(entry, catalogs);
  const coins = coinBreakdownForEntry(entry, catalogs);
  const quantity = coins ? coinTotal(coins) : entry.quantity;
  if (parentEntryId(entry) && item.container?.slotsWhenStowed !== undefined) {
    return stackSlots(quantity, item.container.slotsWhenStowed, item.stackSize);
  }
  return stackSlots(quantity, item.slotsPerUnit, item.stackSize);
}

export function buildInventoryTree(entries: InventoryEntry[], catalogs: Catalogs): InventoryTree {
  const nodeById = new Map<string, InventoryNode>();
  const allNodes: InventoryNode[] = entries.map((entry) => {
    const item = entryItem(entry, catalogs);
    const node: InventoryNode = {
      entry,
      item,
      children: [],
      usedSlots: 0,
      capacitySlots: item.container?.capacitySlots,
      overCapacity: false,
      usedCoins: 0,
      coinCapacity: item.container?.coinCapacity,
      overCoinCapacity: false
    };
    nodeById.set(entry.id, node);
    return node;
  });

  const byEntityId: Record<string, InventoryNode[]> = {};
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  for (const node of allNodes) {
    const parentId = parentEntryId(node.entry);
    const parent = parentId ? nodeById.get(parentId) : undefined;
    if (
      parentId &&
      parent &&
      parent.entry.entityId === node.entry.entityId &&
      parent.item.type === "container" &&
      !wouldCreateParentCycle(node.entry.id, parentId, entryById)
    ) {
      parent.children.push(node);
    } else {
      byEntityId[node.entry.entityId] ??= [];
      byEntityId[node.entry.entityId].push(node);
    }
  }

  const sortNodes = (nodes: InventoryNode[], seenIds = new Set<string>()) => {
    nodes.sort((a, b) => {
      const aContainer = a.item.type === "container" ? 0 : 1;
      const bContainer = b.item.type === "container" ? 0 : 1;
      return aContainer - bContainer || a.item.name.localeCompare(b.item.name);
    });
    nodes.forEach((node) => {
      if (seenIds.has(node.entry.id)) return;
      sortNodes(node.children, new Set([...seenIds, node.entry.id]));
    });
  };
  Object.values(byEntityId).forEach((nodes) => sortNodes(nodes));

  const computeUsedSlots = (node: InventoryNode, seenIds = new Set<string>()): void => {
    if (seenIds.has(node.entry.id)) return;
    const nextSeenIds = new Set([...seenIds, node.entry.id]);
    const childSlots = node.children.reduce((total, child) => {
      if (node.coinCapacity !== undefined && isCoinEntry(child.entry, catalogs)) return total;
      return total + entrySlots(child.entry, catalogs);
    }, 0);
    const childCoins = node.children.reduce((total, child) => {
      const coins = coinBreakdownForEntry(child.entry, catalogs);
      return coins ? total + coinTotal(coins) : total;
    }, 0);
    node.usedSlots = childSlots;
    node.overCapacity = node.capacitySlots !== undefined && childSlots > node.capacitySlots;
    node.usedCoins = childCoins;
    node.overCoinCapacity = node.coinCapacity !== undefined && childCoins > node.coinCapacity;
    node.children.forEach((child) => computeUsedSlots(child, nextSeenIds));
  };
  allNodes.forEach((node) => computeUsedSlots(node));

  return { byEntityId, allNodes };
}

function wouldCreateParentCycle(entryId: string, parentId: string, entryById: Map<string, InventoryEntry>): boolean {
  const seenIds = new Set<string>();
  let currentId: string | null = parentId;
  while (currentId) {
    if (currentId === entryId || seenIds.has(currentId)) return true;
    seenIds.add(currentId);
    const current = entryById.get(currentId);
    currentId = current ? parentEntryId(current) : null;
  }
  return false;
}

export function carriedLoadCategory(
  entry: InventoryEntry,
  entries: InventoryEntry[],
  catalogs: Catalogs
): ContainerLoadCategory {
  const root = outerCarriedEntry(entry, entries);
  const item = entryItem(root, catalogs);
  return item.container?.loadCategory ?? "equipped";
}

function outerCarriedEntry(entry: InventoryEntry, entries: InventoryEntry[]): InventoryEntry {
  const entryById = new Map(entries.map((candidate) => [candidate.id, candidate]));
  let current = entry;
  const seenIds = new Set<string>();
  let parentId = parentEntryId(current);
  while (parentId && !seenIds.has(current.id)) {
    seenIds.add(current.id);
    const parent = entryById.get(parentId);
    if (!parent) return current;
    current = parent;
    parentId = parentEntryId(current);
  }
  return current;
}

export function entityLoadBreakdown(entityId: string, entries: InventoryEntry[], catalogs: Catalogs): EntityLoadBreakdown {
  const load = {
    equippedSlots: 0,
    stowedSlots: 0,
    carriedSlots: 0
  };

  for (const entry of entries.filter((candidate) => candidate.entityId === entityId)) {
    const slots = entrySlots(entry, catalogs);
    if (carriedLoadCategory(entry, entries, catalogs) === "stowed") {
      load.stowedSlots += slots;
    } else {
      load.equippedSlots += slots;
    }
  }

  load.carriedSlots = load.equippedSlots + load.stowedSlots;
  return load;
}

export function handsOccupiedBySlot(slot: HandSlot): Array<"left_hand" | "right_hand"> {
  if (slot === "both_hands") return ["left_hand", "right_hand"];
  return [slot];
}

export function entityHandOccupancy(entityId: string, entries: InventoryEntry[]): Record<"left_hand" | "right_hand", InventoryEntry[]> {
  const hands: Record<"left_hand" | "right_hand", InventoryEntry[]> = { left_hand: [], right_hand: [] };
  for (const entry of entries.filter((candidate) => candidate.entityId === entityId)) {
    const slot = entryHandSlot(entry);
    if (!slot) continue;
    for (const hand of handsOccupiedBySlot(slot)) {
      hands[hand].push(entry);
    }
  }
  return hands;
}

export function validateHandAssignment(
  entityId: string,
  entries: InventoryEntry[],
  handSlot: HandSlot | null | undefined,
  ignoreEntryId?: string
): HandValidationResult {
  if (!handSlot) return { ok: true };
  const occupiedHands = handsOccupiedBySlot(handSlot);
  const blockers = entries.filter((entry) => {
    if (entry.entityId !== entityId || entry.id === ignoreEntryId) return false;
    const candidateSlot = entryHandSlot(entry);
    return candidateSlot ? handsOccupiedBySlot(candidateSlot).some((hand) => occupiedHands.includes(hand)) : false;
  });
  return blockers.length ? { ok: false, blockers } : { ok: true };
}

export function handSlotForLocation(location: InventoryLocation, handSlot: HandSlot | null | undefined): HandSlot | null {
  return isInventoryLocation(location) && location.kind === "equipped" ? handSlot ?? null : null;
}

export function movementForSlots(slots: number) {
  const threshold = ENCUMBRANCE_THRESHOLDS.find((candidate) => slots <= candidate.max);
  if (threshold) {
    return {
      carriedSlots: slots,
      movementExploration: threshold.movementExploration,
      movementEncounter: threshold.movementEncounter,
      encumbranceLabel: threshold.label,
      overloaded: false
    };
  }
  return {
    carriedSlots: slots,
    movementExploration: 0,
    movementEncounter: 0,
    encumbranceLabel: "Overloaded",
    overloaded: true
  };
}

function entityCapacitySlots(entity: Entity): number | null {
  const capacity = entity.logistics?.capacitySlots;
  return capacity !== null && capacity !== undefined && Number.isFinite(capacity) ? Math.max(0, Math.floor(capacity)) : null;
}

function entityMovement(entity: Entity, carriedSlots: number, overEntityCapacity: boolean) {
  const configuredExploration = entity.logistics?.movementExploration;
  const configuredEncounter = entity.logistics?.movementEncounter;
  const hasConfiguredMovement =
    (entity.type === "mount" || entity.type === "vehicle") &&
    configuredExploration !== null &&
    configuredExploration !== undefined &&
    Number.isFinite(configuredExploration);

  if (hasConfiguredMovement) {
    const movementExploration = Math.max(0, Math.floor(configuredExploration));
    const movementEncounter =
      configuredEncounter !== null && configuredEncounter !== undefined && Number.isFinite(configuredEncounter)
        ? Math.max(0, Math.floor(configuredEncounter))
        : Math.floor(movementExploration / 3);
    return {
      carriedSlots,
      movementExploration,
      movementEncounter,
      encumbranceLabel: overEntityCapacity ? "Over capacity" : "Vehicle/mount",
      overloaded: overEntityCapacity
    };
  }

  if (entity.type === "storage") {
    return {
      carriedSlots,
      movementExploration: 0,
      movementEncounter: 0,
      encumbranceLabel: overEntityCapacity ? "Over capacity" : "Storage",
      overloaded: overEntityCapacity
    };
  }

  const movement = movementForSlots(carriedSlots);
  return overEntityCapacity
    ? { ...movement, encumbranceLabel: "Over capacity", overloaded: true }
    : movement;
}

export function durationTurns(entry: InventoryEntry, item: ItemTemplate): { max: number | null; used: number } {
  const max = entry.state?.durationTurnsMax ?? item.gear?.durationTurnsMax ?? null;
  const used = entry.state?.durationTurnsUsed ?? item.gear?.durationTurnsUsed ?? 0;
  return { max, used };
}

export function turnsRemaining(entry: InventoryEntry, item: ItemTemplate): number | null {
  const { max, used } = durationTurns(entry, item);
  if (max === null) return null;
  return Math.max(0, max - used);
}

export function isActiveLight(entry: InventoryEntry, catalogs: Catalogs): boolean {
  const item = entryItem(entry, catalogs);
  if (!item.emitsLight || entry.state?.isLit !== true || entry.state?.isDepleted || !isInUseHandEntry(entry)) return false;
  const remaining = turnsRemaining(entry, item);
  return remaining === null || remaining > 0;
}

export function armorClass(entity: Entity, entries: InventoryEntry[], catalogs: Catalogs): number | null {
  if (!["character", "retainer", "hireling"].includes(entity.type)) return null;
  const dex = abilityModifier(entity.abilities?.dexterity);
  const entityEntries = entries.filter((entry) => entry.entityId === entity.id);
  const equippedArmor = entityEntries
    .map((entry) => ({ entry, item: entryItem(entry, catalogs) }))
    .filter(({ entry, item }) => isInventoryLocation(entry.location) && entry.location.kind === "equipped" && item.armor?.armorType === "armor")
    .sort((a, b) => (b.item.armor?.baseAcAscending ?? 10) - (a.item.armor?.baseAcAscending ?? 10))[0];
  const base = equippedArmor?.item.armor?.baseAcAscending ?? 10;
  const armorMagic = equippedArmor?.item.armor?.magicAcBonus ?? 0;
  const shieldBonus = entityEntries
    .map((entry) => ({ entry, item: entryItem(entry, catalogs) }))
    .filter(({ entry, item }) => isInUseHandEntry(entry) && item.armor?.armorType === "shield")
    .reduce((total, { item }) => total + (item.armor?.acBonus ?? 0) + (item.armor?.magicAcBonus ?? 0), 0);
  return base + armorMagic + shieldBonus + dex;
}

export function armorCategory(item: ItemTemplate): "light" | "medium" | "heavy" | "shield" | null {
  if (item.armor?.armorType === "shield") return "shield";
  if (item.armor?.armorType !== "armor") return null;
  const ac = item.armor.baseAcAscending ?? 10;
  if (ac <= 13) return "light";
  if (ac <= 14) return "medium";
  return "heavy";
}

export function classRestrictionWarnings(
  entity: Entity,
  entries: InventoryEntry[],
  catalogs: Catalogs
): RestrictionWarning[] {
  if (!entity.classId) return [];
  const classDef = catalogs.classesById[entity.classId];
  const armor = classDef?.proficiencies?.armor ?? classDef?.armor_proficiencies;
  if (!armor) return [];

  const warnings: RestrictionWarning[] = [];
  for (const entry of entries.filter((candidate) => candidate.entityId === entity.id)) {
    const item = entryItem(entry, catalogs);
    const category = armorCategory(item);
    if (!category) continue;
    if (category === "shield" && !isInUseHandEntry(entry)) continue;
    if (category !== "shield" && (!isInventoryLocation(entry.location) || entry.location.kind !== "equipped")) continue;

    const allowed =
      category === "shield"
        ? armor.shields
        : category === "light"
          ? armor.light
          : category === "medium"
            ? armor.medium
            : armor.heavy;
    if (!allowed) {
      warnings.push({
        severity: "warning",
        source: "class",
        affectedItemId: entry.id,
        message: `${entity.name} is using ${item.name}, but ${classDef.class_name} armor rules say: ${armor.source_text ?? "restricted"}.`
      });
    }
  }
  return warnings;
}

export function summarizeEntity(
  entity: Entity,
  entries: InventoryEntry[],
  catalogs: Catalogs,
  mode: ViewMode
): EntitySummary {
  const classDef = entity.classId ? catalogs.classesById[entity.classId] : undefined;
  const levelData = classLevelData(classDef, entity.xp);
  const load = entityLoadBreakdown(entity.id, entries, catalogs);
  const capacitySlots = entityCapacitySlots(entity);
  const overEntityCapacity = capacitySlots !== null && load.carriedSlots > capacitySlots;
  const movement = entityMovement(entity, load.carriedSlots, overEntityCapacity);
  const entityEntries = entries.filter((entry) => entry.entityId === entity.id);
  const activeLights = entityEntries.filter((entry) => isActiveLight(entry, catalogs)).map((entry) => {
    const item = entryItem(entry, catalogs);
    return {
      entryId: entry.id,
      name: displayName(entry, catalogs, mode),
      radiusFeet: item.lightRadiusFeet ?? null,
      turnsRemaining: turnsRemaining(entry, item)
    };
  });
  const warnings = classRestrictionWarnings(entity, entries, catalogs);
  const tree = buildInventoryTree(entityEntries, catalogs);
  for (const node of tree.allNodes.filter((candidate) => candidate.overCapacity)) {
    warnings.push({
      severity: "warning",
      source: "houseRule",
      affectedItemId: node.entry.id,
      message: `${node.item.name} is over capacity (${node.usedSlots}/${node.capacitySlots} slots).`
    });
  }
  for (const node of tree.allNodes.filter((candidate) => candidate.overCoinCapacity)) {
    warnings.push({
      severity: "warning",
      source: "houseRule",
      affectedItemId: node.entry.id,
      message: `${node.item.name} holds too many coins (${node.usedCoins}/${node.coinCapacity} coins).`
    });
  }

  const hands = entityHandOccupancy(entity.id, entries);
  for (const [slot, occupants] of Object.entries(hands)) {
    if (occupants.length > 1) {
      warnings.push({
        severity: "warning",
        source: "houseRule",
        message: `${entity.name} has too many items assigned to ${slot.replace("_", " ")}.`
      });
    }
  }

  for (const entry of entityEntries.filter((candidate) => isInUseHandEntry(candidate))) {
    const item = entryItem(entry, catalogs);
    const handsRequired = item.handsRequired ?? 0;
    const handsAssigned = entry.handSlot ? handsOccupiedBySlot(entry.handSlot).length : 0;
    const handsNeeded = handsRequired * entry.quantity;
    if (handsNeeded > handsAssigned) {
      warnings.push({
        severity: "warning",
        source: "houseRule",
        affectedItemId: entry.id,
        message: `${displayName(entry, catalogs, mode)} stack needs ${handsNeeded} hands but is assigned ${handsAssigned}.`
      });
    }
  }

  if (movement.overloaded) {
    warnings.push({
      severity: "warning",
      source: "houseRule",
      message: overEntityCapacity
        ? `${entity.name} is over capacity (${load.carriedSlots}/${capacitySlots} slots).`
        : `${entity.name} is overloaded.`
    });
  }
  if (["character", "retainer", "hireling"].includes(entity.type) && entity.hp && entity.hp.currentHp <= 0) {
    warnings.push({
      severity: "illegal",
      source: "houseRule",
      message: `${entity.name} is at ${entity.hp.currentHp} HP.`
    });
  }

  return {
    entity,
    level: levelData?.level,
    xpForNextLevel: xpForNextLevel(classDef, entity.xp),
    armorClass: armorClass(entity, entries, catalogs),
    attackModifier: levelData?.attack_modifier,
    savingThrows: levelData?.saving_throws,
    equippedSlots: load.equippedSlots,
    stowedSlots: load.stowedSlots,
    capacitySlots,
    ...movement,
    activeLights,
    warnings
  };
}

export function spendLightTurn(entry: InventoryEntry, catalogs: Catalogs): LightTurnSpendResult | null {
  if (entry.state?.isLit !== true) return null;
  const item = entryItem(entry, catalogs);
  const { max, used } = durationTurns(entry, item);
  if (max === null) return null;
  const nextUsed = Math.min(max, used + 1);
  const nextEntry: InventoryEntry = {
    ...entry,
    state: {
      ...entry.state,
      isLit: nextUsed < max,
      isDepleted: nextUsed >= max ? !item.gear?.consumedOnUse : false,
      durationTurnsUsed: nextUsed,
      durationTurnsMax: max
    }
  };
  if (nextUsed >= max && item.gear?.consumedOnUse) {
    return {
      disposition: "consumed",
      entry: nextEntry,
      event: { type: "itemConsumed", entryId: entry.id, itemName: item.name, reason: "duration" }
    };
  }
  if (nextUsed >= max) {
    return {
      disposition: "updated",
      entry: nextEntry,
      event: { type: "itemDepleted", entryId: entry.id, itemName: item.name, reason: "duration" }
    };
  }
  return { disposition: "updated", entry: nextEntry };
}

export function spendLightTurnPatch(entry: InventoryEntry, catalogs: Catalogs): InventoryEntry | null {
  const result = spendLightTurn(entry, catalogs);
  return result?.disposition === "updated" ? result.entry : null;
}

export function splitInventoryEntry(entry: InventoryEntry, splitQuantity: number): [InventoryEntry, InventoryEntry] {
  const quantity = Math.max(1, Math.min(entry.quantity - 1, Math.floor(splitQuantity)));
  return [
    { ...entry, quantity: entry.quantity - quantity },
    {
      ...entry,
      id: crypto.randomUUID(),
      quantity,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
}

function createMissingItem(id: string): ItemTemplate {
  return {
    id,
    type: "gear",
    identified: true,
    name: "Missing item",
    quantity: 1,
    slotsPerUnit: 0,
    emitsLight: false,
    cursed: false,
    description: `No catalog item found for ${id}.`
  };
}

function isLegacyCoinEntry(entry: InventoryEntry, catalogs: Catalogs): boolean {
  const item = entryItem(entry, catalogs);
  const name = (entry.state?.customName ?? item.name).trim().toLowerCase();
  return item.type === "treasure" && name === "coins";
}

function normalizeCoinCount(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}
