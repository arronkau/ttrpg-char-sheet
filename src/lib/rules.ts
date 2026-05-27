import type {
  Catalogs,
  ClassDefinition,
  Entity,
  EntitySummary,
  InventoryEntry,
  InventoryLocation,
  InventoryNode,
  InventoryTree,
  ItemTemplate,
  RestrictionWarning,
  ViewMode
} from "../types";

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

export function entrySlots(entry: InventoryEntry, catalogs: Catalogs): number {
  const item = entryItem(entry, catalogs);
  if (entry.location === "container" && item.container?.slotsWhenStowed !== undefined) {
    return stackSlots(entry.quantity, item.container.slotsWhenStowed, item.stackSize);
  }
  return stackSlots(entry.quantity, item.slotsPerUnit, item.stackSize);
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
      overCapacity: false
    };
    nodeById.set(entry.id, node);
    return node;
  });

  const byEntityId: Record<string, InventoryNode[]> = {};

  for (const node of allNodes) {
    const parentId = node.entry.parentEntryId;
    const parent = parentId ? nodeById.get(parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      byEntityId[node.entry.entityId] ??= [];
      byEntityId[node.entry.entityId].push(node);
    }
  }

  const sortNodes = (nodes: InventoryNode[]) => {
    nodes.sort((a, b) => a.item.name.localeCompare(b.item.name));
    nodes.forEach((node) => sortNodes(node.children));
  };
  Object.values(byEntityId).forEach(sortNodes);

  const computeUsedSlots = (node: InventoryNode): number => {
    const childSlots = node.children.reduce((total, child) => total + entrySlots(child.entry, catalogs), 0);
    node.usedSlots = childSlots;
    node.overCapacity = node.capacitySlots !== undefined && childSlots > node.capacitySlots;
    node.children.forEach(computeUsedSlots);
    return childSlots;
  };
  allNodes.forEach((node) => computeUsedSlots(node));

  return { byEntityId, allNodes };
}

export function entityCarriedSlots(entityId: string, entries: InventoryEntry[], catalogs: Catalogs): number {
  return entries
    .filter((entry) => entry.entityId === entityId && !entry.parentEntryId)
    .reduce((total, entry) => total + entrySlots(entry, catalogs), 0);
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
  if (!item.emitsLight || entry.state?.isLit !== true) return false;
  const remaining = turnsRemaining(entry, item);
  return remaining === null || remaining > 0;
}

export function armorClass(entity: Entity, entries: InventoryEntry[], catalogs: Catalogs): number | null {
  if (!["character", "retainer", "hireling"].includes(entity.type)) return null;
  const dex = abilityModifier(entity.abilities?.dexterity);
  const entityEntries = entries.filter((entry) => entry.entityId === entity.id);
  const equippedArmor = entityEntries
    .map((entry) => ({ entry, item: entryItem(entry, catalogs) }))
    .filter(({ entry, item }) => entry.location === "equipped" && item.armor?.armorType === "armor")
    .sort((a, b) => (b.item.armor?.baseAcAscending ?? 10) - (a.item.armor?.baseAcAscending ?? 10))[0];
  const base = equippedArmor?.item.armor?.baseAcAscending ?? 10;
  const armorMagic = equippedArmor?.item.armor?.magicAcBonus ?? 0;
  const shieldBonus = entityEntries
    .map((entry) => ({ entry, item: entryItem(entry, catalogs) }))
    .filter(
      ({ entry, item }) =>
        ["equipped", "in_hand"].includes(entry.location) && item.armor?.armorType === "shield"
    )
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
    if (!["equipped", "in_hand"].includes(entry.location)) continue;
    const item = entryItem(entry, catalogs);
    const category = armorCategory(item);
    if (!category) continue;
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
  const carriedSlots = entityCarriedSlots(entity.id, entries, catalogs);
  const movement = movementForSlots(carriedSlots);
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
  if (movement.overloaded) {
    warnings.push({
      severity: "warning",
      source: "houseRule",
      message: `${entity.name} is overloaded.`
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
    ...movement,
    activeLights,
    warnings
  };
}

export function spendLightTurnPatch(entry: InventoryEntry, catalogs: Catalogs): InventoryEntry | null {
  if (!isActiveLight(entry, catalogs)) return null;
  const item = entryItem(entry, catalogs);
  const { max, used } = durationTurns(entry, item);
  if (max === null) return null;
  const nextUsed = Math.min(max, used + 1);
  return {
    ...entry,
    state: {
      ...entry.state,
      isLit: nextUsed < max,
      durationTurnsUsed: nextUsed,
      durationTurnsMax: max
    }
  };
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

export function validTransferLocation(parentEntryId: string | null | undefined): InventoryLocation {
  return parentEntryId ? "container" : "carried_loose";
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
