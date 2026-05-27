export type EntityType = "character" | "retainer" | "mount" | "vehicle" | "hireling" | "storage";

export type HandSlot = "left_hand" | "right_hand" | "both_hands";

export type ContainerLoadCategory = "equipped" | "stowed";

export type InventoryLocation =
  | { kind: "equipped" }
  | { kind: "contained"; parentEntryId: string };

export type InventoryActionResult = { ok: true } | { ok: false; message: string };

export type ViewMode = "gm" | "player";

export type AbilityScores = {
  strength: number;
  intelligence: number;
  wisdom: number;
  dexterity: number;
  constitution: number;
  charisma: number;
};

export type HitPoints = {
  currentHp: number;
  maxHp: number;
  temporaryHp?: number;
};

export type CampaignSettings = {
  viewMode: ViewMode;
  encumbranceMethod: "slots";
};

export type Campaign = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: CampaignSettings;
};

export type Entity = {
  id: string;
  type: EntityType;
  name: string;
  playerName?: string;
  classId?: string;
  raceId?: string | null;
  xp?: number;
  abilities?: AbilityScores;
  hp?: HitPoints;
  alignment?: string;
  languages?: string[];
  combatState?: {
    activeConditions?: Array<{ id: string; name: string; description?: string }>;
    wounds?: string | null;
  };
  spellcasting?: {
    spellbookSpellIds?: string[];
    knownSpells?: string[];
    memorizedSpells?: Array<{ id: string; spellId: string; expended: boolean; source?: string }>;
  };
  notes?: {
    publicNotes?: string;
    privateNotes?: string;
    refereeNotes?: string;
  };
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ArmorType = "armor" | "shield" | "helmet";

export type ItemType = "weapon" | "armor" | "gear" | "container" | "treasure";

export type ItemTemplate = {
  id: string;
  type: ItemType;
  identified: boolean;
  secretDetails?: SecretItemDetails | null;
  name: string;
  description?: string;
  quantity: number;
  slotsPerUnit: number;
  stackSize?: number | null;
  handsRequired?: number | null;
  emitsLight?: boolean;
  lightRadiusFeet?: number | null;
  cursed?: boolean;
  curseDescription?: string | null;
  gpValue?: number | null;
  source?: string;
  sourcePage?: string | null;
  weapon?: {
    damage: string;
    isMagic?: boolean;
    rangeShort?: number | null;
    rangeMedium?: number | null;
    rangeLong?: number | null;
    qualities?: string[];
    ammunitionType?: string | null;
    attackBonus?: number | null;
    damageBonus?: number | null;
  };
  armor?: {
    armorType: ArmorType;
    baseAcAscending?: number | null;
    acBonus?: number | null;
    magicAcBonus?: number | null;
  };
  gear?: {
    gearKind?: string;
    usesMax?: number | null;
    usesRemaining?: number | null;
    consumedOnUse?: boolean;
    durationTurnsMax?: number | null;
    durationTurnsUsed?: number | null;
    durationDescription?: string | null;
    containsSpells?: boolean;
    spellData?: unknown[] | null;
    language?: string | null;
    readable?: boolean | null;
    deciphered?: boolean | null;
    rulesNote?: string | null;
  };
  container?: {
    capacitySlots: number;
    canBeStowed?: boolean;
    slotsWhenStowed: number;
    loadCategory?: ContainerLoadCategory;
  };
  treasure?: Record<string, never>;
};

export type SecretItemDetails = {
  item?: Partial<Omit<ItemTemplate, "id" | "secretDetails">>;
  weapon?: Partial<NonNullable<ItemTemplate["weapon"]>>;
  armor?: Partial<NonNullable<ItemTemplate["armor"]>>;
  gear?: Partial<NonNullable<ItemTemplate["gear"]>>;
  container?: Partial<NonNullable<ItemTemplate["container"]>>;
  treasure?: Record<string, never>;
  gmNotes?: string;
};

export type InventoryEntryState = {
  chargesRemaining?: number | null;
  usesRemaining?: number | null;
  isLit?: boolean;
  durationTurnsUsed?: number | null;
  durationTurnsMax?: number | null;
  customName?: string | null;
  customDescription?: string | null;
};

export type InventoryEntry = {
  id: string;
  entityId: string;
  itemTemplateId?: string;
  customItem?: ItemTemplate;
  quantity: number;
  location: InventoryLocation;
  handSlot?: HandSlot | null;
  state?: InventoryEntryState;
  createdAt: string;
  updatedAt: string;
};

export type ClassLevel = {
  level: number;
  xp_required: number;
  hit_dice?: string;
  thac0?: number;
  attack_modifier?: number;
  saving_throws?: Record<string, number>;
  spells?: Record<string, number> | null;
};

export type ClassDefinition = {
  id: string;
  class_name: string;
  requirements?: string;
  prime_requisites?: string[];
  hit_die?: string;
  maximum_level?: number;
  armor_proficiencies?: ArmorProficiencies;
  proficiencies?: {
    armor?: ArmorProficiencies;
    spell_list?: {
      id: string;
      magic_type?: string;
      source_text?: string;
    } | null;
  };
  spellcasting_type?: string | null;
  levels: ClassLevel[];
  feature_progression?: {
    skills_by_level?: Record<string, Record<string, number | string>>;
  };
  feature_text_raw?: string;
  skill_notes?: Array<{ skill_id: string; name: string; text: string }>;
};

export type ArmorProficiencies = {
  light: boolean;
  medium: boolean;
  heavy: boolean;
  shields: boolean;
  source_text?: string;
};

export type SpellReference = {
  id: string;
  name: string;
  classes: Array<{ class: string; level: number }>;
  normalizedClasses: Array<{ classId: string; level: number }>;
  range?: string | null;
  duration?: string | null;
  save?: string | null;
  area?: string | null;
  target?: string | null;
  description: string;
  source?: string;
  sourceCitationText?: string;
  isAdapted?: boolean;
  conversionNotes?: string | null;
  originalText?: unknown;
};

export type Catalogs = {
  classes: ClassDefinition[];
  classesById: Record<string, ClassDefinition>;
  items: ItemTemplate[];
  itemsById: Record<string, ItemTemplate>;
  spells: SpellReference[];
  spellsById: Record<string, SpellReference>;
};

export type RestrictionWarning = {
  severity: "info" | "warning" | "illegal";
  source: "class" | "race" | "houseRule" | "itemException";
  message: string;
  affectedItemId?: string;
};

export type EntitySummary = {
  entity: Entity;
  level?: number;
  xpForNextLevel?: number | null;
  armorClass: number | null;
  attackModifier?: number;
  savingThrows?: Record<string, number>;
  equippedSlots: number;
  stowedSlots: number;
  carriedSlots: number;
  movementExploration: number;
  movementEncounter: number;
  encumbranceLabel: string;
  overloaded: boolean;
  activeLights: Array<{
    entryId: string;
    name: string;
    radiusFeet: number | null;
    turnsRemaining: number | null;
  }>;
  warnings: RestrictionWarning[];
};

export type InventoryNode = {
  entry: InventoryEntry;
  item: ItemTemplate;
  children: InventoryNode[];
  usedSlots: number;
  capacitySlots?: number;
  overCapacity: boolean;
};

export type InventoryTree = {
  byEntityId: Record<string, InventoryNode[]>;
  allNodes: InventoryNode[];
};
