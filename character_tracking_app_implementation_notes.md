# Goal 

A table-usable collaborative real-time web-based ttrpg character tracker for party use that enables: 
- easy reference for characters and referee for table critical questions (spell text, party movement speed, ac/hp, light sources, items in hands, etc.)
- simple and lightweight modifications to inventory by anyone, including GM-dropped treasure hoards that can be easily transferred by players to their character sheets

Non-goals: roll automation, mapping, in-depth rules reference, party log or notes, or anything that requires heavy use during play. 

# Overview

## Character Tracking App Implementation Notes

### Scope

This document assumes spells, inventory and item characteristics, and core character fundamentals are already modeled. It focuses on two rules areas and the main views needed for a practical OSE/Arden Vul character tracking app.

## Rules

### Encumbrance

Encumbrance should be implemented as derived state, not manually entered.

Core model:

```ts
encumbranceProfile {
  method: "slots" | "coinWeight" | "custom";
  thresholds: Array<{
    maxLoad: number;
    movementExploration: number; // e.g. 120, 90, 60, 30
    movementEncounter: number;   // e.g. 40, 30, 20, 10
    label: string;
  }>;
}
```

Each entity should expose:

```ts
encumbranceState {
  carriedLoad: number;
  equippedLoad: number;
  stowedLoad: number;
  containerLoad: number;
  treasureLoad: number;
  maxLoad?: number;
  movementExploration: number;
  movementEncounter: number;
  encumbranceLabel: string;
  overloaded: boolean;
}
```

Implementation notes:

- Treat items, containers, coins/treasure, and mounts/vehicles as inventory-bearing objects.
- Containers should support both their own carried size and their contained contents.
- “Equipped,” “in hand,” and “stowed” are UI/organization states; only the rules profile decides whether they affect movement differently.
- Light sources should be tracked as inventory items with state: `isLit`, `turnsRemaining`, `radius`, `handsRequired`.
- Movement should be easy to surface at the party level because it affects exploration pace, encounter movement, pursuit, retreat, and time pressure.

### Class Restrictions

Class restrictions should be implemented as validation warnings, not hard blocks, unless the app is intentionally enforcing legality.

Core model:

```ts
classRestrictions {
  allowedArmor: string[] | "any" | "none";
  allowedShields: boolean;
  allowedWeapons: string[] | "any";
  allowedSpellLists: string[];
  allowedMagicItemTags?: string[] | "any";
  prohibitedItemTags?: string[];
  skillAccess: string[];
  languageRules?: string;
  notes?: string;
}
```

Validation output:

```ts
restrictionWarning {
  severity: "info" | "warning" | "illegal";
  source: "class" | "race" | "houseRule" | "itemException";
  message: string;
  affectedItemId?: string;
}
```

Implementation notes:

- Store restrictions on the class or race-as-class definition, not on individual characters.
- Items should have tags such as `weapon:sword`, `armor:chain`, `shield`, `missile`, `twoHanded`, `clericAllowed`, `magicUserAllowed`, etc.
- Some items must override normal class assumptions. Support item-level exceptions.
- Do not silently unequip illegal items. Show warnings and let the referee/player decide.

## Views

### Party Summary for GM

Purpose: fast table-facing operational dashboard.

Show one row per active party member, retainer, mount, vehicle, or relevant light-bearing entity.

Fields:

```ts
partySummaryRow {
  name;
  type; // character | retainer | mount | vehicle | hireling
  classLevel;
  alignment?;
  ac;
  hpCurrent;
  hpMax;
  movementExploration;
  movementEncounter;
  carriedLoad;
  encumbranceLabel;
  activeLightSources;
  languages;
  keySkills;
  saves?;
  notableConditions;
}
```

Priority display:

- Movement
- AC
- HP
- Light sources and remaining duration
- Languages
- Thief/dungeon skills
- Active conditions
- Warnings: overloaded, no light, illegal equipment, dying/low HP

### Character Sheet for Player Use

Purpose: complete player-facing state for one character.

Sections:

```ts
characterSheet {
  identity;
  abilityScores;
  classAndLevel;
  xp;
  hp;
  ac;
  saves;
  attackValues;
  skills;
  languages;
  inventory;
  equippedGear;
  weapons;
  armor;
  spells;
  treasure;
  retainers?;
  notes;
  ruleWarnings;
}
```

Display calculated fields clearly:

- Level from XP/class table
- AC from armor + shield + Dexterity + magic
- Movement from encumbrance
- Attack bonus / THAC0 equivalent from class table
- Saves from class/level
- Skill values from class/level/race
- Spell slots from class/level
- XP-to-next-level

Stored fields should remain minimal: identity, class/race, XP, ability scores, HP state, inventory state, selected spells, languages chosen, notes, and manual overrides.

### Inventory Overview of Party

Purpose: logistics, treasure division, and “where is the rope?” queries.

Entities:

```ts
inventoryEntity {
  id;
  name;
  type: "character" | "retainer" | "mount" | "vehicle" | "storage";
  location?;
  contents;
  capacity?;
  encumbranceState?;
}
```

View behavior:

- Tree view by entity → containers → items.
- Flat searchable item view across the whole party.
- Filters: carried by, item type, treasure, light source, weapon, armor, magic, unidentified, quest item, container.
- Bulk transfer between entities.
- Show slot/load totals per entity and per container.
- Show “unassigned treasure” and “stored at base” separately from carried inventory.
- Flag containers that exceed capacity.

### Reference Views

#### Spell List

Purpose: searchable rules reference and spell preparation support.

Fields:

```ts
spellReference {
  name;
  spellLists;
  levelByClass;
  range;
  duration;
  effectSummary;
  fullText;
  source;
  tags;
  conversionNotes?;
}
```

Features:

- Search by name/full text.
- Filter by class list, level, tag, source, prepared/known.
- Character-aware mode: show only spells available to selected character.
- Allow spell selection into memorized/prepared slots.

#### Item List

Purpose: equipment reference and item creation source.

Fields:

```ts
itemReference {
  name;
  category; // weapon | armor | gear | treasure | magic | tech | container
  cost;
  gpValue?;
  load;
  handsRequired?;
  damage?;
  acModifier?;
  armorBaseAc?;
  range?;
  capacity?;
  stackSize?;
  tags;
  allowedClasses?;
  source;
  description;
}
```

Features:

- Search/filter by category, cost, load, class legality, hands required, damage, AC, container capacity.
- “Add to inventory” action.
- “Create custom copy” action for altered or unidentified items.
- Hide secret/unidentified properties from player views unless revealed.

## Implementation Judgement Calls

The main tradeoff is rules enforcement vs. referee flexibility.

For OSR play, warnings are safer than hard constraints. Characters often carry things they cannot effectively use, use cursed or strange items, or interact with setting-specific exceptions.

Use hard calculation for:

- AC
- Movement
- Load
- XP threshold
- Saves
- Spell slots

Use warnings for:

- Class restrictions
- Illegal equipment
- Over-capacity containers
- Missing light
- Unusual item interactions

# Character Schema

## OSE:AF Character Sheet Data Schema

### Purpose

This schema defines the minimum stored data needed to represent a player character in an OSE:AF table aid app.

It does **not** store rules logic. Class features, attack calculations, saving throw tables, spell progression, movement calculation, encumbrance rules, and derived modifiers should live elsewhere.

---

## Stored Character Data

```ts
type Character = {
  id: string;

  identity: CharacterIdentity;
  ancestryAndClass: CharacterAncestryAndClass;
  advancement: CharacterAdvancement;
  abilities: AbilityScores;
  hitPoints: HitPointData;
  alignment: AlignmentData;
  languages: LanguageData;
  combatState: CombatStateData;
  spellcasting?: CharacterSpellcastingData;
  inventory: CharacterInventoryData;
  notes?: CharacterNotes;
};
```

---

## Identity

```ts
type CharacterIdentity = {
  name: string;
  playerName?: string;
  portraitUrl?: string | null;

  pronouns?: string | null;
  age?: string | null;
  appearance?: string | null;
  background?: string | null;
};
```

Purpose: descriptive identity only. No rule logic.

---

## Ancestry and Class

```ts
type CharacterAncestryAndClass = {
  classId: string;
  raceId?: string | null;

  // For race-as-class games, classId may already imply race.
  raceAsClass?: boolean;

  title?: string | null;
};
```

Notes:
- `classId` should reference a class definition elsewhere.
- `raceId` should reference a race definition elsewhere, if race and class are separate.
- Do not store class features here. Those belong in class/rules reference data.

---

## Advancement

```ts
type CharacterAdvancement = {
  xp: number;
  xpAdjustments?: XpAdjustment[];
};
```

```ts
type XpAdjustment = {
  id: string;
  label: string;
  amount: number;
  reason?: string;
};
```

Notes:
- Store XP.
- Do not store level unless manually overriding normal progression.
- Level should usually be calculated from `classId` and `xp`.

---

## Ability Scores

```ts
type AbilityScores = {
  strength: number;
  intelligence: number;
  wisdom: number;
  dexterity: number;
  constitution: number;
  charisma: number;
};
```

Notes:
- Store raw scores only.
- Modifiers should be calculated.

---

## Hit Points

```ts
type HitPointData = {
  maxHp: number;
  currentHp: number;
  temporaryHp?: number;
};
```

Notes:
- `maxHp` is stored because rolled HP is character-specific historical data.
- Do not calculate max HP from class/level unless using fully deterministic HP rules.

---

## Alignment

```ts
type AlignmentData = {
  alignment: "lawful" | "neutral" | "chaotic" | string;
  deity?: string | null;
  faction?: string | null;
};
```

---

## Languages

```ts
type LanguageData = {
  knownLanguageIds: string[];
  customLanguages?: string[];
};
```

Notes:
- Languages should reference a language list elsewhere.
- Custom languages allow campaign-specific additions.

---

## Combat State

```ts
type CombatStateData = {
  activeConditions?: CharacterCondition[];
  wounds?: string | null;
};
```

```ts
type CharacterCondition = {
  id: string;
  name: string;
  description?: string;
  source?: string | null;
  expiresAt?: string | null;
};
```

Notes:
- Store current conditions.
- Do not store mechanical interpretations unless needed for display.
- Rules effects should be handled elsewhere.

---

## Spellcasting

Only include this section for spellcasting characters.

```ts
type CharacterSpellcastingData = {
  spellbookSpellIds?: string[];
  memorizedSpells?: MemorizedSpell[];
  knownSpells?: string[];
};
```

```ts
type MemorizedSpell = {
  id: string;
  spellId: string;
  source?: "class" | "scroll" | "item" | "other";
  expended: boolean;
};
```

Notes:
- Spell rules and spell descriptions belong in spell reference data.
- This only tracks what the character has access to and what is currently memorized/expended.
- For non-memorization casters, use `knownSpells` or another class-specific reference pattern outside this core schema.

---

## Inventory Tracking

The character sheet should not define item rules. It should only track which item instances are associated with the character and how they are being carried or used.

```ts
type CharacterInventoryData = {
  entries: InventoryEntry[];
};
```

```ts
type InventoryEntry = {
  id: string;

  itemId: string;
  quantity: number;

  location: InventoryLocation;

  parentContainerEntryId?: string | null;

  state?: InventoryEntryState;
};
```

```ts
type InventoryLocation =
  | "carried_loose"
  | "equipped"
  | "in_hand"
  | "stowed"
  | "container";
```

### Inventory Location Meanings

```md
carried_loose:
  Item is carried directly on the character but not worn, equipped, held, or inside a container.

equipped:
  Item is worn/readied on the body, such as armor, helmet, backpack, pouch, cloak, or jewelry.

in_hand:
  Item is actively held in one or both hands.

stowed:
  Item is packed away and not immediately accessible.

container:
  Item is inside another inventory item that has container data.
```

### Inventory Entry State

```ts
type InventoryEntryState = {
  chargesRemaining?: number | null;
  usesRemaining?: number | null;

  isLit?: boolean;
  durationTurnsUsed?: number | null;

  customName?: string | null;
  customDescription?: string | null;
};
```

Notes:
- `itemId` points to the item definition.
- `quantity` belongs to the inventory entry, not the item definition, if using reusable item templates.
- `location` belongs here, not in the item model.
- `parentContainerEntryId` tracks nesting.
- `state` tracks mutable instance-specific facts: lit torch, partially used torch, remaining charges, custom labels, etc.

---

## Notes

```ts
type CharacterNotes = {
  publicNotes?: string;
  privateNotes?: string;
  refereeNotes?: string;
};
```

---

## Calculated / Displayed but Not Stored

These values should be shown on the sheet, but normally calculated from stored data plus rules/reference data.

### Advancement

```md
level:
  Calculated from classId and xp.

xpForNextLevel:
  Calculated from classId and xp.

classTitle:
  Calculated from classId and level, unless overridden manually.
```

### Ability Modifiers

```md
strengthModifier:
  Calculated from strength.

intelligenceModifier:
  Calculated from intelligence.

wisdomModifier:
  Calculated from wisdom.

dexterityModifier:
  Calculated from dexterity.

constitutionModifier:
  Calculated from constitution.

charismaModifier:
  Calculated from charisma.
```

### Combat

```md
armorClass:
  Calculated from armor, shield, magicAcBonus, dexterity, and other active modifiers.

attackBonus:
  Calculated from class, level, weapon, magic bonus, and situational modifiers.

meleeAttackBonus:
  Calculated from attackBonus plus relevant strength/weapon/rules data.

missileAttackBonus:
  Calculated from attackBonus plus relevant dexterity/weapon/rules data.

damage:
  Calculated from weapon, class house rules, magic bonus, and situational modifiers.

savingThrows:
  Calculated from class, level, and active modifiers.

initiativeModifier:
  Calculated from dexterity and active rules, if applicable.
```

### Movement and Encumbrance

```md
totalSlotsUsed:
  Calculated from inventory entries, item slots, quantity, stackSize, and container rules.

looseSlots:
  Calculated from inventory entries marked carried_loose or in_hand.

stowedSlots:
  Calculated from inventory entries inside containers or marked stowed.

movementRate:
  Calculated from inventory, armor, encumbrance rules, and character rules.

handsOccupied:
  Calculated from inventory entries marked in_hand and item handsRequired.

availableHands:
  Calculated from handsOccupied.
```

### Spellcasting

```md
spellSlotsOrMemorizationCapacity:
  Calculated from class, level, and spellcasting rules.

spellsAvailableToCast:
  Calculated from memorizedSpells, expended flags, class rules, and item/spell data.

spellSaveModifier:
  Calculated from class/rules data if used.
```

### Thief / Class Skills

```md
skillTargets:
  Calculated from class, level, race, house rules, and modifiers.

listenAtDoors:
  Calculated from default skill rules and modifiers.

searchOrSecretDoorDetection:
  Calculated from default skill rules and modifiers.

turnUndeadTarget:
  Calculated from class, level, holy symbol, and rules data.
```

### Retainers / Reaction / Morale

```md
reactionModifier:
  Calculated from charisma and relevant rules.

maxRetainers:
  Calculated from charisma.

retainerMoraleModifier:
  Calculated from charisma and campaign rules.
```

---

## Minimal Data Summary

At minimum, a character needs:

```ts
type MinimalCharacter = {
  id: string;
  name: string;

  classId: string;
  raceId?: string | null;

  xp: number;

  abilities: AbilityScores;

  maxHp: number;
  currentHp: number;

  alignment: string;

  knownLanguageIds: string[];

  inventory: CharacterInventoryData;
};
```

Everything else is optional, descriptive, current-state tracking, or calculated elsewhere.


# Item Schema

## Item Model Design Spec

### Purpose

This model defines item categories and item properties for a player-facing OSE inventory app.

The item model describes the items themselves only. It does not describe where an item is located, who owns it, whether it is equipped, or whether it is stowed. Those relationships belong to the larger inventory system.

### Core Design Rules

- Every item uses the same base `Item` structure.
- Item types should exist only where different app behavior is required.
- Identification is a core item property.
- Any item can be unidentified.
- Any item can have GM-only secret replacement data.
- Any item can be cursed.
- Any item can emit light.
- Any item can require one or two hands to carry or use.
- Item location, ownership, equipped status, and stowed status are not item properties.

---

## Core Item Object

```ts
type Item = {
  id: string;

  // Classification
  type: ItemType;

  // Identification
  identified: boolean; // default: true
  secretDetails?: SecretItemDetails | null;

  // Display / editable description
  name: string;
  description?: string;

  // Inventory / encumbrance
  quantity: number;
  slotsPerUnit: number;
  stackSize?: number | null;

  // Handling
  hand_required?: number; // 0, 1, 1, default: 0 

  // Light
  emitsLight?: boolean; // default: false
  lightRadiusFeet?: number | null;

  // Curse
  cursed?: boolean; // default: false
  curseDescription?: string | null;

  // Value / sale conversion
  gpValue?: number | null;

  // Type-specific data
  weapon?: WeaponData;
  armor?: ArmorData;
  gear?: GearData;
  container?: ContainerData;
  treasure?: TreasureData;

  // Source tracking
  source?: string;
  sourcePage?: string;
};
```

---

## Item Types

```ts
type ItemType =
  | "weapon"
  | "armor"
  | "gear"
  | "container"
  | "treasure";
```

### Type Definitions

```md
weapon:
  Combat item with attack-relevant fields: damage, range, and weapon qualities.

armor:
  Defensive item that modifies AC.

gear:
  General catch-all for tools, supplies, ammunition, food, light sources, liquids, medicine, poison, books, maps, scrolls, spellbooks, documents, and miscellaneous adventuring equipment.

container:
  Item that can hold other items.

treasure:
  Valuable loot whose primary function is to be sold or converted to coin.
```

---

## Identification Model

Identification has two states:

```ts
identified: boolean; // default: true
```

### When `identified = true`

The item’s normal fields are player-visible and treated as the current canonical item data.

### When `identified = false`

The item’s normal fields are player-visible placeholder data.

The item may also contain `secretDetails`, which is GM-only replacement data. `secretDetails` may include duplicate replacement values for any field on the base item or on the item’s type-specific data.

### When an Item Becomes Identified

When `identified` changes from `false` to `true`:

1. Replace any standard item fields with corresponding values from `secretDetails.item`.
2. Replace any type-specific fields with corresponding values from `secretDetails.weapon`, `secretDetails.armor`, `secretDetails.gear`, `secretDetails.container`, or `secretDetails.treasure`.
3. Clear or retain `secretDetails` according to the app’s audit/history needs.
4. Set `identified = true`.

---

## Secret Item Details

`secretDetails` is a GM-only replacement object. It may duplicate any normal item field or type-specific field.

```ts
type SecretItemDetails = {
  item?: Partial<Omit<Item, "id" | "secretDetails">>;

  weapon?: Partial<WeaponData>;
  armor?: Partial<ArmorData>;
  gear?: Partial<GearData>;
  container?: Partial<ContainerData>;
  treasure?: Partial<TreasureData>;

  gmNotes?: string;
};
```

### Secret Replacement Examples

```md
Unidentified magic sword:
  visible item:
    type: weapon
    identified: false
    name: "black iron sword"
    description: "A well-balanced black iron sword with old inscriptions."
    quantity: 1
    slotsPerUnit: 1
    weapon.damage: "1d8"
    weapon.qualities: ["Melee"]

  secretDetails:
    item.name: "Flame Tongue Sword +1"
    item.description: "A magic sword that ignites on command."
    item.gpValue: null
    weapon.attackBonus: 1
    weapon.damageBonus: 1
    weapon.qualities: ["Melee", "Quick draw"]
    gmNotes: "Ignites on command; deals additional fire damage if using that house rule."

Unidentified potion:
  visible item:
    type: gear
    identified: false
    name: "cloudy blue potion"
    description: "A cloudy blue liquid in a stoppered glass vial."
    quantity: 1
    slotsPerUnit: 1
    stackSize: 6
    gear.gearKind: "liquid"

  secretDetails:
    item.name: "Potion of Healing"
    item.description: "A potion that restores hit points when consumed."
    gear.consumedOnUse: true
    gear.usesMax: 1
    gear.usesRemaining: 1
    gear.rulesNote: "Restores 1d6+1 hp."

Cursed shield:
  visible item:
    type: armor
    identified: false
    name: "bronze shield with a serpent boss"
    description: "A bronze shield marked with a coiled serpent."
    quantity: 1
    slotsPerUnit: 1
    armor.armorType: "shield"
    armor.acBonus: 1

  secretDetails:
    item.name: "Shield -1"
    item.cursed: true
    item.curseDescription: "-1 AC penalty; cannot be discarded without remove curse."
    armor.acBonus: -1
```

---

## Slot Model

All items use the same slot fields.

```ts
type SlotFields = {
  quantity: number;
  slotsPerUnit: number;
  stackSize?: number | null;
};
```

### Slot Calculation

```ts
if (stackSize && stackSize > 1) {
  calculatedSlots = Math.ceil(quantity / stackSize) * slotsPerUnit;
} else {
  calculatedSlots = quantity * slotsPerUnit;
}
```

### Slot Examples

```md
Torch bundle:
  quantity: 6
  slotsPerUnit: 1
  stackSize: 3
  calculatedSlots: 2

Sword:
  quantity: 1
  slotsPerUnit: 1
  stackSize: null
  calculatedSlots: 1

Coins:
  quantity: 450
  slotsPerUnit: 1
  stackSize: 100
  calculatedSlots: 5

Potion:
  quantity: 2
  slotsPerUnit: 1
  stackSize: 6
  calculatedSlots: 1
```

---

## Handling Fields

Any item may require one or two hands.

```ts
type HandlingFields = {
  twoHanded?: boolean; // default: false
};
```

### Handling Rules

```md
twoHanded = false:
  Item can be carried or used in one hand.

twoHanded = true:
  Item requires both hands to carry or use effectively.
```

Examples:

```md
Sword:
  twoHanded: false

Two-handed sword:
  twoHanded: true

Chest:
  twoHanded: true

Torch:
  twoHanded: false

Polearm:
  twoHanded: true
```

---

## Light Fields

Any item may emit light.

```ts
type LightFields = {
  emitsLight?: boolean; // default: false
  lightRadiusFeet?: number | null;
};
```

### Light Rules

```md
emitsLight = false:
  Item does not emit light.

emitsLight = true:
  Item emits light out to lightRadiusFeet.
```

Examples:

```md
Lit torch:
  emitsLight: true
  lightRadiusFeet: 30

Lantern:
  emitsLight: true
  lightRadiusFeet: 30

Glowing magic sword:
  emitsLight: true
  lightRadiusFeet: 15

Unlit torch:
  emitsLight: false
  lightRadiusFeet: null
```

---

## Curse Fields

Any item may be cursed.

```ts
type CurseFields = {
  cursed?: boolean; // default: false
  curseDescription?: string | null;
};
```

### Curse Rules

```md
cursed = false:
  Item has no known curse.

cursed = true:
  Item has a curse. If unidentified, the curse may exist only in secretDetails.
```

Examples:

```md
Cursed sword:
  cursed: true
  curseDescription: "Berserker curse; wielder must save to stop fighting."

Cursed armor:
  cursed: true
  curseDescription: "Cannot be removed without remove curse."

Unidentified cursed ring:
  identified: false
  cursed: false
  secretDetails.item.cursed: true
  secretDetails.item.curseDescription: "Wearer cannot willingly part with the ring."
```

---

## Weapon Data

Only used when `type = "weapon"`.

```ts
type WeaponData = {
  damage: string;

  rangeShort?: number | null;
  rangeMedium?: number | null;
  rangeLong?: number | null;

  qualities?: WeaponQuality[];

  ammunitionType?: string | null;

  attackBonus?: number | null;
  damageBonus?: number | null;
};
```

### Weapon Qualities

Weapon qualities are multi-select.

```ts
type WeaponQuality =
  | "Blunt"
  | "Brace"
  | "Brutal"
  | "Charge"
  | "Crushing"
  | "Deadly"
  | "Entangle"
  | "Knock-out"
  | "Light"
  | "Melee"
  | "Missile"
  | "Poison"
  | "Quick draw"
  | "Shield Grappler"
  | "Slow"
  | "Specialized"
  | "Splash"
  | "Stealth"
  | "Strangle"
  | "Two-handed"
  | "Versatile";
```

### Weapon Quality Definitions

```md
Blunt:
  May be used by clerics.

Brace:
  Bracing against the ground doubles damage against charging enemies.

Brutal:
  If the result of the attack roll with this weapon is a natural 20, the subsequent damage dealt by the weapon is doubled.

Charge:
  On horseback, moving at least 60’ in a round and attacking doubles any damage done with a successful hit.

Crushing:
  On a critical hit vs. a humanoid creature of the attacker’s size or smaller, the attacker can choose to either disarm the target or halve the target’s movement rate.

Deadly:
  Roll damage dice with Advantage: roll damage dice twice and keep the higher result.

Entangle:
  On a successful hit, the target must save vs. paralysis or be unable to move or act. A new save is allowed each round to escape.

Knock-out:
  On a critical hit, the target must save vs. paralysis or be knocked out for 1d6 turns. The target must be the attacker’s size or smaller and biologically susceptible to blunt trauma.

Light:
  This weapon can be used in the off-hand when attacking with two weapons.

Melee:
  Close quarters weapon, 5’ or less.

Missile:
  Thrown or fired weapon, greater than 5’ distance. Short, medium, and long ranges are tracked separately.

Poison:
  This weapon inflicts no damage, but may administer a bloodstream poison.

Quick draw:
  This weapon can be readied as part of the same action used to attack.

Shield Grappler:
  Attacking with this weapon negates an opponent’s shield bonus to AC.

Slow:
  The character attacks last in each combat round.

Specialized:
  Only classes with Strength as a prime requisite can wield this weapon efficiently. All others suffer a -4 penalty to hit.

Splash:
  On a successful attack, the container smashes and douses the target with the liquid. Damage is inflicted over two rounds, as the liquid drips off.

Stealth:
  May only be used to attack an unaware person from behind. Any successful attack with this weapon is considered a critical hit.

Strangle:
  Following a successful hit, this weapon inflicts automatic damage each round. The victim cannot move and suffers a -2 penalty to attack rolls. A successful hit on the attacker allows the victim to break free.

Two-handed:
  Requires both hands; the character cannot use a shield.

Versatile:
  May be used with one or two hands. When wielded two-handed, the weapon gains the Deadly trait.
```

### Weapon Examples

```md
Sword:
  type: weapon
  identified: true
  name: "Sword"
  quantity: 1
  slotsPerUnit: 1
  twoHanded: false
  weapon.damage: "class_hd"
  weapon.qualities: ["Melee", "Quick draw", "Versatile"]

Short bow:
  type: weapon
  identified: true
  name: "Short bow"
  quantity: 1
  slotsPerUnit: 2
  twoHanded: true
  weapon.damage: "class_hd"
  weapon.rangeShort: 50
  weapon.rangeMedium: 100
  weapon.rangeLong: 150
  weapon.qualities: ["Missile", "Two-handed"]
  weapon.ammunitionType: "arrow"

Battle axe:
  type: weapon
  identified: true
  name: "Battle axe"
  quantity: 1
  slotsPerUnit: 2
  twoHanded: true
  weapon.damage: "class_hd"
  weapon.qualities: ["Deadly", "Melee", "Shield Grappler", "Two-handed"]

Torch, used as weapon:
  type: weapon
  identified: true
  name: "Torch"
  quantity: 1
  slotsPerUnit: 1
  stackSize: 3
  twoHanded: false
  emitsLight: true
  lightRadiusFeet: 30
  weapon.damage: "class_hd"
  weapon.qualities: ["Melee"]
```

---

## Armor Data

Only used when `type = "armor"`.

```ts
type ArmorData = {
  armorType: ArmorType;

  baseAcAscending?: number | null;
  acBonus?: number | null;
};
```

```ts
type ArmorType =
  | "armor"
  | "shield"
  | "helmet";
```

### Armor Examples

```md
Leather armor:
  type: armor
  identified: true
  name: "Leather armor"
  quantity: 1
  slotsPerUnit: 1
  armor.armorType: "armor"
  armor.baseAcAscending: 12

Chainmail:
  type: armor
  identified: true
  name: "Chainmail"
  quantity: 1
  slotsPerUnit: 2
  armor.armorType: "armor"
  armor.baseAcAscending: 14

Shield:
  type: armor
  identified: true
  name: "Shield"
  quantity: 1
  slotsPerUnit: 1
  armor.armorType: "shield"
  armor.acBonus: 1

Helmet:
  type: armor
  identified: true
  name: "Helmet"
  quantity: 1
  slotsPerUnit: 0
  armor.armorType: "helmet"
  description: "Can absorb damage from a single successful critical hit, then is rendered useless. Imposes -1 penalty to surprise."
```

---

## Gear Data

Used for tools, supplies, ammunition, food, light sources, liquids, medicine, poison, books, maps, scrolls, spellbooks, documents, and miscellaneous adventuring equipment.

```ts
type GearData = {
  gearKind?: GearKind;

  usesMax?: number | null;
  usesRemaining?: number | null;
  consumedOnUse?: boolean;

  durationTurnsMax?: number | null;
  durationTurnsUsed?: number | null;
  durationDescription?: string | null;

  compatibleWith?: string[] | null;

  containsSpells?: boolean;
  spellData?: SpellData[] | null;

  language?: string | null;
  readable?: boolean;
  deciphered?: boolean;

  rulesNote?: string | null;
};
```

```ts
type GearKind =
  | "tool"
  | "supply"
  | "ammunition"
  | "food"
  | "light"
  | "liquid"
  | "medicine"
  | "poison"
  | "book"
  | "map"
  | "scroll"
  | "spellbook"
  | "document"
  | "misc";
```

```ts
type SpellData = {
  spellName: string;
  spellLevel?: number | null;
  spellList?: SpellList | null;

  singleUse?: boolean;
  copiedToSpellbook?: boolean | null;

  mishapRule?: string | null;
};
```

```ts
type SpellList =
  | "cleric"
  | "druid"
  | "magic_user"
  | "illusionist"
  | "other";
```

### Gear Duration Rules

For gear with duration measured in turns:

```ts
durationTurnsRemaining = durationTurnsMax - durationTurnsUsed;
```

Examples:

```md
Fresh torch:
  durationTurnsMax: 6
  durationTurnsUsed: 0
  durationTurnsRemaining: 6

Partly used torch:
  durationTurnsMax: 6
  durationTurnsUsed: 3
  durationTurnsRemaining: 3

Lantern oil flask:
  durationTurnsMax: 24
  durationTurnsUsed: 8
  durationTurnsRemaining: 16
```

### Gear Examples

```md
Arrows:
  type: gear
  identified: true
  name: "Arrow"
  quantity: 20
  slotsPerUnit: 1
  stackSize: 20
  gear.gearKind: "ammunition"
  gear.compatibleWith: ["short bow", "long bow"]

Torch:
  type: gear
  identified: true
  name: "Torch"
  quantity: 6
  slotsPerUnit: 1
  stackSize: 3
  twoHanded: false
  emitsLight: false
  lightRadiusFeet: null
  gear.gearKind: "light"
  gear.durationTurnsMax: 6
  gear.durationTurnsUsed: 0
  gear.consumedOnUse: true

Lit torch:
  type: gear
  identified: true
  name: "Lit torch"
  quantity: 1
  slotsPerUnit: 1
  stackSize: null
  twoHanded: false
  emitsLight: true
  lightRadiusFeet: 30
  gear.gearKind: "light"
  gear.durationTurnsMax: 6
  gear.durationTurnsUsed: 2
  gear.consumedOnUse: true

Rations:
  type: gear
  identified: true
  name: "Ration"
  quantity: 7
  slotsPerUnit: 1
  stackSize: 7
  gear.gearKind: "food"
  gear.consumedOnUse: true

Oil flask:
  type: gear
  identified: true
  name: "Oil flask"
  quantity: 3
  slotsPerUnit: 1
  stackSize: 6
  gear.gearKind: "liquid"
  gear.consumedOnUse: true

Spell scroll:
  type: gear
  identified: false
  name: "scroll with arcane script"
  description: "A parchment scroll covered in arcane writing."
  quantity: 1
  slotsPerUnit: 0
  gear.gearKind: "scroll"
  gear.containsSpells: false

  secretDetails:
    item.name: "Scroll of Sleep"
    gear.containsSpells: true
    gear.spellData:
      - spellName: "Sleep"
        spellLevel: 1
        spellList: "magic_user"
        singleUse: true

Spellbook:
  type: gear
  identified: true
  name: "Spellbook"
  quantity: 1
  slotsPerUnit: 1
  gear.gearKind: "spellbook"
  gear.containsSpells: true
  gear.spellData:
    - spellName: "Read Magic"
      spellLevel: 1
      spellList: "magic_user"
    - spellName: "Shield"
      spellLevel: 1
      spellList: "magic_user"

Map:
  type: gear
  identified: false
  name: "water-stained map"
  description: "A damaged map showing several corridors and unclear markings."
  quantity: 1
  slotsPerUnit: 0
  gear.gearKind: "map"

  secretDetails:
    item.name: "Partial map to the Drowned Canyon"
    item.description: "A partial map showing a possible route to tombs in the Drowned Canyon."
```

---

## Container Data

Only used when `type = "container"`.

```ts
type ContainerData = {
  capacitySlots: number;

  canBeStowed?: boolean; // default: true
  slotsWhenStowed: number;
};
```

### Container Rules

```md
capacitySlots:
  Number of slots the container can hold internally.

canBeStowed:
  Whether the container may itself be placed inside another container.

slotsWhenStowed:
  Number of slots the container occupies when carried inside another container.
```

### Container Examples

```md
Backpack:
  type: container
  identified: true
  name: "Backpack"
  quantity: 1
  slotsPerUnit: 1
  container.capacitySlots: 10
  container.canBeStowed: true
  container.slotsWhenStowed: 1

Sack:
  type: container
  identified: true
  name: "Sack"
  quantity: 1
  slotsPerUnit: 1
  container.capacitySlots: 8
  container.canBeStowed: true
  container.slotsWhenStowed: 1

Chest:
  type: container
  identified: true
  name: "Chest"
  quantity: 1
  slotsPerUnit: 3
  twoHanded: true
  container.capacitySlots: 20
  container.canBeStowed: false
  container.slotsWhenStowed: 3
```

---

## Treasure Data

Only used when `type = "treasure"`.

Treasure exists as a distinct item type so the app can support selling, liquidation, or conversion to coin.

Treasure does not require additional structured fields beyond the core item fields.

```ts
type TreasureData = Record<string, never>;
```

### Treasure Examples

```md
Gold coins:
  type: treasure
  identified: true
  name: "Gold coin"
  description: "Standard gold coin."
  quantity: 250
  slotsPerUnit: 1
  stackSize: 100
  gpValue: 1

Ruby:
  type: treasure
  identified: true
  name: "Ruby"
  description: "A cut ruby worth 500 gp."
  quantity: 1
  slotsPerUnit: 0
  gpValue: 500

Ancient statuette:
  type: treasure
  identified: false
  name: "small bronze statuette"
  description: "A small bronze statuette of uncertain age."
  quantity: 1
  slotsPerUnit: 1
  gpValue: null

  secretDetails:
    item.name: "Archontean bronze votive statue of Thoth"
    item.description: "An ancient Archontean bronze votive statue of Thoth worth 250 gp."
    item.gpValue: 250
```

---

## Type Assignment Rules

```md
If it is primarily used to attack:
  type = weapon

If it primarily changes AC or absorbs damage as armor:
  type = armor

If it holds other items:
  type = container

If it is primarily valuable loot meant to be sold or converted to coin:
  type = treasure

Otherwise:
  type = gear
```

### Mixed Item Rules

```md
Magic sword:
  type = weapon
  identified = false if unknown
  secretDetails contains magic properties

Cursed armor:
  type = armor
  identified = false if curse unknown
  secretDetails contains curse

Potion:
  type = gear
  identified = false if unknown
  secretDetails contains effect

Spell scroll:
  type = gear
  gear.gearKind = "scroll"
  identified = false if spell unknown
  secretDetails contains spellData

Spellbook:
  type = gear
  gear.gearKind = "spellbook"
  secretDetails may contain hidden spellData if not fully understood

Map:
  type = gear
  gear.gearKind = "map"
  secretDetails may contain corrected or deciphered description

Jeweled holy relic:
  type = treasure if its main purpose is sale value
  type = gear if its main purpose is ritual or tool use
  secretDetails may contain hidden significance
```

---

## Final Recommended Item Types

```ts
type ItemType =
  | "weapon"
  | "armor"
  | "gear"
  | "container"
  | "treasure";
```

### Final Category Summary

```md
weapon:
  Damage, range, attack bonuses, damage bonuses, weapon qualities.

armor:
  AC value or AC bonus.

gear:
  Tools, supplies, ammunition, consumables, light, food, liquids, medicine, poison, books, maps, scrolls, spellbooks, documents, and miscellaneous equipment.

container:
  Capacity and stowed-slot behavior.

treasure:
  Sellable or coin-convertible valuables.
```

