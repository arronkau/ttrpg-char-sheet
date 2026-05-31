## OSE Rules for App Correctness

Purpose: capture non-house-rule Old-School Essentials rules that are relevant to character-sheet, party-summary, inventory, spell, and reference views. This is not a full rules document. It is a correctness checklist and test-spec aid for separating rule calculation from display and persistence logic.

Assumption: the app may use ascending AC internally because the existing data model has fields such as `baseAcAscending`, `armorClass`, `attack_modifier`, and `attackModifier`. OSE treats ascending AC as optional, but it is compatible with OSE and easier to test in a modern app.

Source basis: OSE SRD pages for Ability Scores, Creating a Character, Saving Throws, Time/Weight/Movement, Weapons and Armour, Alignment, and Advancement.

## Naming and Internal Field Mapping

| OSE term | Suggested app/internal term | Notes |
|---|---:|---|
| Strength / STR | `abilities.strength` | Stored ability score, integer 3–18 for ordinary PCs. |
| Intelligence / INT | `abilities.intelligence` | Determines language count and literacy status. |
| Wisdom / WIS | `abilities.wisdom` | Applies to magical saving throws when applicable. |
| Dexterity / DEX | `abilities.dexterity` | Affects AC, missile attack rolls, and optional individual initiative. |
| Constitution / CON | `abilities.constitution` | Affects HP rolls, minimum +1 HP per Hit Die gained. |
| Charisma / CHA | `abilities.charisma` | Affects reaction rolls, retainer limit, and loyalty. |
| Armour Class / AC | `armorClass` | Prefer ascending AC in app display/calculation unless a campaign explicitly tracks descending AC. |
| Ascending AC | `baseAcAscending`, `armorClass` | Unarmoured base is 10 ascending. Leather 12, chainmail 14, plate 16; shield adds +1. |
| THAC0 | `thac0` | Class table value. If using ascending AC, convert to attack bonus. |
| Attack bonus | `attack_modifier`, `attackModifier` | For ascending AC. For OSE class tables, `attackBonus = 19 - thac0`. |
| Saving throws | `saving_throws`, `savingThrows` | Store by stable category keys; display labels can be separate. |
| Death / poison | `death_poison` or `D` | Saving throw category. |
| Wands | `wands` or `W` | Saving throw category. |
| Paralysis / petrify | `paralysis_petrify` or `P` | Saving throw category. |
| Breath attacks | `breath_attacks` or `B` | Saving throw category. |
| Spells / rods / staves | `spells_rods_staves` or `S` | Saving throw category. |
| Exploration movement | `movementExploration` | First value in OSE movement pair, e.g. 120'. |
| Encounter movement | `movementEncounter` | Parenthetical value in OSE movement pair, e.g. 40'. |
| Hit points | `hp.currentHp`, `hp.maxHp` | `maxHp` changes on level-up; `currentHp` is play state. |
| Class level row | `ClassLevel` | Level, XP threshold, THAC0/attack bonus, saves, spells. |
| Prime requisite | `prime_requisites` | Class data, not a derived field unless used for XP modifier. |
| XP | `xp` | Stored value. Level can be derived from class level thresholds. |

## General Implementation Boundaries

Rules logic should be pure functions wherever possible. Do not bury OSE calculations inside React components, display components, Firestore adapters, modal forms, or drag/drop handlers.

Recommended pure rule modules:

```text
src/rules/ose/abilities.ts
src/rules/ose/combat.ts
src/rules/ose/saves.ts
src/rules/ose/advancement.ts
src/rules/ose/encumbrance.ts
src/rules/ose/equipment.ts
src/rules/ose/characters.ts
```

Display code should ask rule modules for derived values. Persistence code should store canonical data, not duplicated calculations, unless the duplication is intentionally cached and invalidated.

## Ability Scores

### Stored Data

Each ordinary PC ability score should be an integer from 3 through 18:

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

Validation tests should reject or warn on missing scores and non-integers. 

### Strength Modifiers

Strength affects melee attack rolls, melee damage rolls, and the chance to force open stuck doors.

| STR | `meleeAttackBonus` | `meleeDamageBonus` | `openDoorsChance` |
|---:|---:|---:|---|
| 3 | -3 | -3 | 1-in-6 |
| 4–5 | -2 | -2 | 1-in-6 |
| 6–8 | -1 | -1 | 1-in-6 |
| 9–12 | 0 | 0 | 2-in-6 |
| 13–15 | +1 | +1 | 3-in-6 |
| 16–17 | +2 | +2 | 4-in-6 |
| 18 | +3 | +3 | 5-in-6 |

Testable function:

```ts
getStrengthModifiers(str: number): {
  meleeAttackBonus: number;
  meleeDamageBonus: number;
  openDoorsPipsOnD6: number;
}
```

Acceptance examples:

```text
STR 3  -> melee -3, open doors 1
STR 9  -> melee 0,  open doors 2
STR 18 -> melee +3, open doors 5
```

### Intelligence Modifiers

Intelligence affects spoken language count and literacy.

| INT | `spokenLanguages` | `additionalLanguages` | `literacy` |
|---:|---|---:|---|
| 3 | Native, broken speech | 0 | illiterate |
| 4–5 | Native | 0 | illiterate |
| 6–8 | Native | 0 | basic |
| 9–12 | Native | 0 | literate |
| 13–15 | Native + 1 additional | 1 | literate |
| 16–17 | Native + 2 additional | 2 | literate |
| 18 | Native + 3 additional | 3 | literate |

Testable function:

```ts
getIntelligenceModifiers(intelligence: number): {
  nativeSpeech: "broken" | "normal";
  additionalLanguages: number;
  literacy: "illiterate" | "basic" | "literate";
}
```

### Wisdom Modifiers

Wisdom affects saves versus magical effects. OSE says this normally does not include breath attacks, but may apply to any saving throw category if the effect is magical and the referee determines it applies.

| WIS | `magicSaveBonus` |
|---:|---:|
| 3 | -3 |
| 4–5 | -2 |
| 6–8 | -1 |
| 9–12 | 0 |
| 13–15 | +1 |
| 16–17 | +2 |
| 18 | +3 |

Testable function:

```ts
getWisdomModifiers(wisdom: number): { magicSaveBonus: number }
```

Important distinction: do not blindly add WIS to every saving throw displayed on the character sheet. It applies when resolving a qualifying magical effect.

### Dexterity Modifiers

Dexterity affects AC, missile attack rolls, and optional individual initiative.

OSE descending AC language says a Dexterity bonus lowers AC. If the app uses ascending AC, invert that display effect: a Dexterity bonus increases ascending AC.

| DEX | `descendingAcModifier` | `ascendingAcModifier` | `missileAttackBonus` | `individualInitiativeBonus` |
|---:|---:|---:|---:|---:|
| 3 | -3 | -3 | -3 | -2 |
| 4–5 | -2 | -2 | -2 | -1 |
| 6–8 | -1 | -1 | -1 | -1 |
| 9–12 | 0 | 0 | 0 | 0 |
| 13–15 | +1 | +1 | +1 | +1 |
| 16–17 | +2 | +2 | +2 | +1 |
| 18 | +3 | +3 | +3 | +2 |

Clarification: the table above expresses the modifier in app-friendly arithmetic. For ascending AC, add `ascendingAcModifier` to the base ascending AC. For descending AC, subtract a positive bonus from the base descending AC or use a separate descending-specific helper to avoid sign confusion.

Testable function:

```ts
getDexterityModifiers(dexterity: number): {
  ascendingAcModifier: number;
  missileAttackBonus: number;
  individualInitiativeBonus: number;
}
```

Acceptance examples:

```text
DEX 3  -> AAC -3, missile -3, initiative -2
DEX 12 -> AAC 0,  missile 0,  initiative 0
DEX 18 -> AAC +3, missile +3, initiative +2
```

### Constitution Modifiers

Constitution affects HP gained when rolling each class Hit Die. A character gains at least 1 HP per Hit Die, regardless of Constitution penalty.

| CON | `hitPointModifierPerHitDie` |
|---:|---:|
| 3 | -3 |
| 4–5 | -2 |
| 6–8 | -1 |
| 9–12 | 0 |
| 13–15 | +1 |
| 16–17 | +2 |
| 18 | +3 |

Testable function:

```ts
applyConstitutionToHitDieRoll(roll: number, constitution: number): number
```

Acceptance examples:

```text
roll 1, CON 3  -> 1, not -2
roll 4, CON 3  -> 1
roll 4, CON 18 -> 7
```

### Charisma Modifiers

Charisma affects reaction rolls, maximum retainers, and retainer loyalty.

| CHA | `reactionModifier` | `maxRetainers` | `retainerLoyalty` |
|---:|---:|---:|---:|
| 3 | -2 | 1 | 4 |
| 4–5 | -1 | 2 | 5 |
| 6–8 | -1 | 3 | 6 |
| 9–12 | 0 | 4 | 7 |
| 13–15 | +1 | 5 | 8 |
| 16–17 | +1 | 6 | 9 |
| 18 | +2 | 7 | 10 |

Testable function:

```ts
getCharismaModifiers(charisma: number): {
  reactionModifier: number;
  maxRetainers: number;
  retainerLoyalty: number;
}
```

## Prime Requisite XP Modifiers

For classes with one prime requisite, use the standard OSE prime requisite modifier table. Classes with multiple prime requisites can have class-specific rules and should not be handled by this generic helper unless the class data explicitly opts into it.

| Prime requisite score | `xpModifierPercent` |
|---:|---:|
| 3–5 | -20 |
| 6–8 | -10 |
| 9–12 | 0 |
| 13–15 | +5 |
| 16–18 | +10 |

Testable function:

```ts
getSinglePrimeRequisiteXpModifier(score: number): -20 | -10 | 0 | 5 | 10
```

Non-goal: do not automate ability-score adjustment during character creation unless explicitly implementing character creation flow. Character creation allows raising prime requisites by lowering STR, INT, or WIS, with restrictions, but that is not needed for ordinary sheet display.

## Level and Advancement

### Stored vs Derived

Store:

```text
entity.xp
entity.classId
ClassDefinition.levels[].xp_required
```

Derive:

```text
level
xpForNextLevel
classLevelRow
attack values
saving throws
spells per day
```

### Level Derivation

A character’s level is the highest class level whose `xp_required` is less than or equal to the character’s stored XP.

Testable function:

```ts
getLevelForXp(levels: ClassLevel[], xp: number): ClassLevel
```

Acceptance examples:

```text
levels: [{level:1,xp_required:0},{level:2,xp_required:2000}]
xp 0    -> level 1
xp 1999 -> level 1
xp 2000 -> level 2
```

### Level-Up Effects

When a character reaches a new level, the class table determines changes to attacks, saves, spells, and class abilities. If the character gains another Hit Die, roll the appropriate die and add Constitution modifier, minimum 1 HP gained.

Implementation note: this app should probably not auto-roll HP. It should display that a level-up is available and allow the table to enter the new max HP manually, or provide an explicit helper that the user triggers.

### One-Level-Per-Session Rule

OSE includes a limit that a character cannot gain more than one level in a single session; extra XP beyond one level short of the following level is lost. This is a session-award rule, not a passive display rule.

Recommended app behavior:

- Do not apply this rule just because `xp` is edited.
- If implementing XP award workflow, apply this rule there.
- Character sheet level display should simply derive level from stored XP.

## Attack Values

### Class Attack Bonus

OSE class tables may store THAC0. If using ascending AC internally:

```text
classAttackBonus = 19 - thac0
```

Acceptance examples:

```text
THAC0 19 -> attack bonus +0
THAC0 18 -> attack bonus +1
THAC0 17 -> attack bonus +2
THAC0 14 -> attack bonus +5
```

If a class level row already has `attack_modifier`, prefer that value and treat `thac0` as source/reference data. If both are present, tests should verify they agree:

```text
attack_modifier === 19 - thac0
```

### Melee Attack Bonus

For a melee weapon attack:

```text
meleeAttackTotal = classAttackBonus + strengthMeleeAttackBonus + weaponAttackBonus + situationalModifiers
```

Do not add Dexterity to melee attacks.

### Melee Damage Bonus

For melee weapon damage:

```text
meleeDamageTotal = weaponDamageRoll + strengthMeleeDamageBonus + weaponDamageBonus + situationalModifiers
```

Do not add class attack bonus to damage.

### Missile Attack Bonus

For a missile weapon attack:

```text
missileAttackTotal = classAttackBonus + dexterityMissileAttackBonus + weaponAttackBonus + rangeOrSituationalModifiers
```

Do not add Dexterity to missile damage unless a specific item/rule says otherwise. Do not add Strength to missile attacks unless a specific weapon/rule says otherwise.

### Attack Roll Resolution with Ascending AC

For ascending AC:

```text
hit = d20Roll + totalAttackBonus >= targetAscendingAc
```

Critical hits and fumbles are not part of core OSE unless added by table rule. Do not implement them as OSE rules.

## Armour Class

### Base Ascending AC

| Armour state | OSE descending AC | App ascending AC |
|---|---:|---:|
| Unarmoured | 9 | 10 |
| Leather armour | 7 | 12 |
| Chainmail | 5 | 14 |
| Plate mail | 3 | 16 |
| Shield | +1 bonus | +1 bonus to AAC |

### AC Calculation, Ascending

```text
armorClass = baseAscendingAc + shieldBonus + dexterityAscendingAcModifier + magicAcBonuses + situationalModifiers
```

Where:

```text
baseAscendingAc = equippedArmor?.baseAcAscending ?? 10
shieldBonus = sum of equipped shield/item AC bonuses that are allowed to stack
```

Acceptance examples:

```text
No armor, DEX 9–12, no shield -> AAC 10
Leather, DEX 9–12, no shield -> AAC 12
Chainmail + shield, DEX 13–15 -> AAC 16
Plate + shield, DEX 18 -> AAC 20
```

Implementation warning: AC should be derived from equipped armour/shield state and Dexterity. Do not store final AC as primary character data unless it is explicitly an override.

## Saving Throws

### Categories

Use stable internal keys and separate display labels.

| Key | Display label | Applies when... |
|---|---|---|
| `death_poison` | Death / Poison | Death rays or poison. |
| `wands` | Wands | Effects from magical wands. |
| `paralysis_petrify` | Paralysis / Petrify | Paralysis or petrification effects. |
| `breath_attacks` | Breath Attacks | Dragon/monster breath weapons. |
| `spells_rods_staves` | Spells / Rods / Staves | Spells and effects from rods or staves. |

### Saving Throw Resolution

OSE saving throws are roll-high checks:

```text
success = d20Roll >= savingThrowTarget
```

If bonuses or penalties apply:

```text
success = d20Roll + modifiers >= savingThrowTarget
```

### Wisdom and Magic Saves

When a qualifying magical effect allows a saving throw, Wisdom may modify the roll. It normally does not apply to breath attacks unless the referee determines the breath attack or effect is magical in the relevant sense.

Recommended resolver signature:

```ts
resolveSavingThrow({
  d20Roll,
  target,
  category,
  isMagicalEffect,
  wisdom,
  situationalModifier = 0,
}): { total: number; success: boolean }
```

### Save Outcomes

For damaging effects, a successful save usually halves damage. For non-damaging effects, a successful save usually negates or avoids the effect. Poison is a special danger: failure against poison is usually fatal, and a poison attack’s ordinary damage is not reduced by the save unless the effect says otherwise.

Non-goal: do not automate spell/effect outcomes unless the specific spell/item is modeled. For this app, it is enough to display save categories and optionally calculate the d20 target check.

## Hit Points

### Stored Data

```ts
type HitPoints = {
  currentHp: number;
  maxHp: number;
  temporaryHp?: number;
}
```

### HP at Character Creation and Level-Up

The class determines Hit Die type. Constitution modifies each Hit Die roll. Minimum HP gained from a Hit Die is 1.

Testable helper:

```ts
calculateHpGain(hitDieRoll: number, constitution: number): number
```

Acceptance examples:

```text
roll 1, CON 3  -> gain 1
roll 2, CON 6  -> gain 1
roll 6, CON 13 -> gain 7
```

Optional OSE rule: re-roll HP rolls of 1 or 2 at 1st level if the referee allows it. Do not apply automatically unless the campaign setting explicitly enables that optional rule.

## Alignment

OSE alignments are:

```text
Lawful
Neutral
Chaotic
```

Suggested stored values:

```ts
type Alignment = "lawful" | "neutral" | "chaotic";
```

Display labels can be title-cased. Do not treat alignment as a mechanical modifier unless a spell, item, class, or scenario rule explicitly does so.

## Languages

At character creation, native languages come from the class/race description and include Common and an alignment language. High Intelligence may grant additional languages.

Recommended data handling:

- Store actual chosen languages in `entity.languages`.
- Use Intelligence only to validate or suggest the number of additional languages.
- Do not silently overwrite stored languages when Intelligence changes unless the user is in an explicit character creation/edit flow.

Suggested helper:

```ts
getAdditionalLanguageSlots(intelligence: number): number
```

Acceptance examples:

```text
INT 12 -> 0 additional languages
INT 13 -> 1 additional language
INT 18 -> 3 additional languages
```

## Equipment and Class Restrictions

### Armour and Shields

Armor item data should distinguish:

```text
armorType: "armor" | "shield" | "helmet"
baseAcAscending?: number
acBonus?: number
magicAcBonus?: number
```

OSE core armor baselines:

| Item | `armorType` | `baseAcAscending` | `acBonus` | Weight in coins |
|---|---|---:|---:|---:|
| Leather armour | armor | 12 | — | 200 |
| Chainmail | armor | 14 | — | 400 |
| Plate mail | armor | 16 | — | 500 |
| Shield | shield | — | +1 | 100 |

Class restrictions should be warnings or illegal states depending on app policy. OSE classes restrict weapon/armor use, but the app should not hard-code those restrictions in components. Use class data such as `armor_proficiencies` / `proficiencies.armor` and item metadata.

Suggested helper:

```ts
getEquipmentRestrictionWarnings(entity, equippedItems, classDefinition): RestrictionWarning[]
```

### Weapon Qualities Relevant to Sheet Logic

| OSE quality | Suggested internal representation | App impact |
|---|---|---|
| Melee | `qualities: ["melee"]` | Use STR for attack and damage. |
| Missile / ranged | ranges present or `qualities: ["missile"]` | Use DEX for attack only. |
| Two-handed | `handsRequired: 2` | Cannot use shield at same time. |
| Slow | `qualities: ["slow"]` | Acts last in combat round; display warning/metadata. |
| Reload | `qualities: ["reload"]` | Optional rule; display metadata unless enabled. |
| Brace | `qualities: ["brace"]` | Doubles damage against charging monsters when braced. |
| Charge | `qualities: ["charge"]` | Mounted charge can double damage when movement requirement met. |
| Blunt | `qualities: ["blunt"]` | Useful for cleric weapon restriction data. |
| Splash | `qualities: ["splash"]` | Special handling/description only unless effects are modeled. |

Non-goal: do not automate brace/charge/splash outcomes in ordinary character sheet calculations. They depend on tactical context.

## Encumbrance and Movement: Official OSE, Not House Rules

Important: the current app appears to use slot-based encumbrance (`encumbranceMethod: "slots"`, `equippedSlots`, `stowedSlots`, `carriedSlots`). Slot encumbrance is not the official OSE rule. For a pure OSE rules module, implement coin-weight encumbrance and/or basic encumbrance separately from any house-rule slot system.

### Weight Unit

OSE measures carried weight in coins. Ten coins equal one pound.

```text
1 coin weight = 0.1 lb
10 coin weight = 1 lb
```

### Treasure Weights

| Treasure | Weight in coins |
|---|---:|
| Coin, any type | 1 |
| Gem | 1 |
| Jewellery, 1 piece | 10 |
| Potion | 10 |
| Rod | 20 |
| Scroll | 1 |
| Staff | 40 |
| Wand | 10 |

### Maximum Load

```text
maximumLoadCoins = 1600
if carriedWeightCoins > 1600 -> movementExploration = 0 and movementEncounter = 0
```

### Basic Encumbrance Option

Basic encumbrance tracks treasure weight only for maximum-load purposes. Equipment weight is not counted. Movement is determined by armour category and whether the character carries significant treasure, as judged by the referee.

| Armour category | Without significant treasure | Carrying significant treasure |
|---|---:|---:|
| Unarmoured | 120' / 40' | 90' / 30' |
| Light armour | 90' / 30' | 60' / 20' |
| Heavy armour | 60' / 20' | 30' / 10' |

Suggested helper:

```ts
getBasicEncumbranceMovement({
  armorCategory,
  carryingSignificantTreasure,
  treasureWeightCoins,
}): { movementExploration: number; movementEncounter: number; overloaded: boolean }
```

Armor categories:

```text
none/unarmoured -> unarmoured
leather -> light
chainmail, plate -> heavy
```

### Detailed Encumbrance Option

Detailed encumbrance tracks treasure, armor, weapons, and significant gear.

| Carried weight | Movement |
|---:|---:|
| 0–400 coins | 120' / 40' |
| 401–600 coins | 90' / 30' |
| 601–800 coins | 60' / 20' |
| 801–1600 coins | 30' / 10' |
| 1601+ coins | 0' / 0' |

Suggested helper:

```ts
getDetailedEncumbranceMovement(carriedWeightCoins: number): {
  movementExploration: number;
  movementEncounter: number;
  overloaded: boolean;
}
```

Acceptance examples:

```text
400 coins  -> 120 / 40, not overloaded
401 coins  -> 90 / 30, not overloaded
600 coins  -> 90 / 30, not overloaded
601 coins  -> 60 / 20, not overloaded
800 coins  -> 60 / 20, not overloaded
801 coins  -> 30 / 10, not overloaded
1600 coins -> 30 / 10, not overloaded
1601 coins -> 0 / 0, overloaded
```

### Coin Treasure Value

OSE coin denominations are normally valued as:

```text
1 pp = 5 gp
1 gp = 1 gp
1 ep = 0.5 gp, if electrum is used
1 sp = 0.1 gp
1 cp = 0.01 gp
```

This app’s current `CoinBreakdown` type has `pp`, `gp`, `sp`, and `cp`, but not `ep`. If using strict OSE treasure support, either add `ep` or explicitly document that electrum is unsupported by app scope.

Suggested helper:

```ts
getCoinValueInGp({ pp, gp, sp, cp }): number
```

Acceptance examples:

```text
{ pp: 1, gp: 0, sp: 0, cp: 0 } -> 5
{ pp: 0, gp: 1, sp: 0, cp: 0 } -> 1
{ pp: 0, gp: 0, sp: 10, cp: 0 } -> 1
{ pp: 0, gp: 0, sp: 0, cp: 100 } -> 1
```

Suggested helper for coin weight:

```ts
getCoinWeightCoins({ pp, gp, sp, cp }): number
```

Acceptance examples:

```text
100 mixed coins -> 100 coin weight
0 coins -> 0 coin weight
```

## Movement Display

OSE movement is often shown as two values:

```text
exploration movement / encounter movement
```

Examples:

```text
120' / 40'
90' / 30'
60' / 20'
30' / 10'
```

Suggested display mapping:

```text
movementExploration = 120
movementEncounter = 40
```

Do not let the display formatter own movement calculation.

## Character Sheet Derived Values

The app should derive these from stored character, class, item, and rules data:

| Derived value | Inputs |
|---|---|
| Level | `xp`, `classDefinition.levels` |
| XP for next level | `xp`, next class level row |
| Class attack bonus | current class level row `attack_modifier` or `thac0` |
| Melee attack bonus | class attack bonus, STR modifier, weapon bonus |
| Missile attack bonus | class attack bonus, DEX modifier, weapon bonus |
| Armour Class | equipped armor, shield, DEX modifier, magic/situational bonuses |
| Saving throws | class level row, situational modifiers, WIS for qualifying magical saves |
| HP gain on level-up | Hit Die roll, CON modifier, minimum 1 |
| Movement | selected encumbrance rule, armor category or carried coin weight |
| Additional language slots | INT modifier table |
| Retainer limit and loyalty | CHA modifier table |
| Prime requisite XP modifier | prime requisite score and class-specific prime requisite rules |

## Values That Should Usually Be Stored, Not Derived

| Stored value | Reason |
|---|---|
| Ability scores | Primary character data. |
| Current HP | Play state, not derivable from max HP. |
| Max HP | Depends on historical Hit Die rolls. |
| XP | Award history / player state. |
| Alignment | Player choice. |
| Languages chosen | Player/referee choice within allowed slots. |
| Inventory entries | Player state. |
| Equipped/stowed/contained location | Player state. |
| Spellbook contents / known spells / memorized spells | Character and session state. |
| Notes | User-entered data. |

## Optional Rules and Scope Flags

OSE includes several optional rules relevant to this app. They must be explicit campaign/settings flags, not silent defaults.

| Optional rule | Suggested setting | Default for strict OSE core |
|---|---|---|
| Ascending AC | `combat.armorClassMode: "ascending" | "descending"` | Either is valid if chosen explicitly; app likely uses ascending. |
| Individual initiative DEX modifier | `combat.individualInitiative: boolean` | false unless enabled. |
| HP reroll 1s/2s at 1st level | `characterCreation.rerollLowHpAtFirstLevel: boolean` | false unless enabled. |
| Basic encumbrance | `encumbrance.method: "ose_basic"` | choose one method. |
| Detailed encumbrance | `encumbrance.method: "ose_detailed"` | choose one method. |
| Slot encumbrance | `encumbrance.method: "slots"` | not OSE; house/system-specific. |
| Reload quality | `combat.reloadOptionalRule: boolean` | false unless enabled. |

## Test Checklist for Codex

Codex should add or verify tests for pure rule functions before changing UI.

### Ability Tests

- Scores 3, 4, 5, 6, 8, 9, 12, 13, 15, 16, 17, 18 return correct modifiers.
- Invalid scores warn or throw consistently.
- DEX modifier is applied correctly to ascending AC.
- CON modifier never reduces HP gain below 1.
- INT language slots and literacy map correctly.
- CHA retainers and loyalty map correctly.

### Combat Tests

- `attackBonus = 19 - thac0`.
- Melee attack includes class attack bonus + STR + weapon attack bonus.
- Missile attack includes class attack bonus + DEX + weapon attack bonus.
- Melee damage includes STR + weapon damage bonus.
- Missile damage does not include DEX by default.
- Two-handed weapons require both hands and conflict with shield use.
- AC calculation uses equipped armor base, shield bonus, DEX modifier, and magic bonuses.

### Save Tests

- Save succeeds on `d20 + modifiers >= target`.
- Save fails below target.
- WIS bonus applies only when the resolver is told the effect is magical/qualifying.
- Save category keys remain stable independent of display labels.

### Advancement Tests

- Level is derived from class XP thresholds.
- XP exactly equal to threshold advances level.
- XP below next threshold does not advance level.
- `xpForNextLevel` is null or equivalent at maximum listed level.
- Level-up HP helper respects CON and minimum gain of 1.

### Encumbrance Tests

- Coin weight totals all coins as 1 coin weight each.
- Treasure weights match OSE table.
- Basic encumbrance movement follows armor category and significant treasure flag.
- Detailed encumbrance thresholds handle exact boundary values correctly.
- 1601+ coin weight means overloaded/no movement.
- Slot encumbrance tests, if retained, are clearly separated from strict OSE tests.

## Non-Goals

Do not implement the following as part of a rules-separation cleanup unless separately requested:

- Dice roller automation.
- Automatic HP rolling on level-up.
- Automatic spell effect resolution.
- Automatic poison death/damage resolution.
- Critical hit/fumble rules.
- Automated character creation workflow.
- House-rule slot encumbrance as if it were OSE.
- General-purpose multi-system rules engine.
- Refactors unrelated to extracting and testing current OSE rule calculations.

## Suggested Codex Task Prompt

Task: Extract OSE rules calculations out of display/model code into pure rule modules and add tests.

Context: The app currently stores character, class, inventory, item, and summary types in TypeScript. OSE rules should be easier to reason about, test, and eventually swap for other systems. Use the rules in `ose_rules_for_app_correctness.md` as the source for expected behavior.

Scope:

- Add pure OSE rule helper modules under `src/rules/ose/`.
- Add unit tests for ability modifiers, attack bonus conversion, AC calculation, saving throw resolution, advancement, and official OSE encumbrance.
- Update existing summary/selectors to consume helpers where the same calculations already exist.
- Keep current UI behavior unless it is plainly incorrect under the documented OSE rule.

Requirements:

- Keep rule functions pure and deterministic.
- Keep UI/display formatting outside the rule modules.
- Keep Firestore/store persistence logic outside the rule modules.
- Use stable internal keys for save categories.
- Preserve ascending AC support.
- Clearly separate strict OSE encumbrance from any slot-based house/system-specific encumbrance.
- Add tests for all boundary values listed in the markdown.

Non-goals:

- Do not add dice rolling automation.
- Do not implement automatic spell effects.
- Do not redesign the character sheet UI.
- Do not change data schema unless required for a failing correctness issue; if schema changes are needed, document them first.
- Do not remove slot encumbrance behavior unless explicitly requested.

Likely files:

- `src/types.ts`
- `src/rules/ose/*.ts`
- `src/**/*.test.ts`
- Existing selector/summary files that calculate `EntitySummary`, AC, attack values, movement, warnings, or inventory totals.

Validation:

```bash
npm test
npm run build
```

Stop condition: Stop after tests pass and the existing UI builds. Do not continue into broad refactors, UI redesign, new automation, or unrelated schema cleanup.

## Source Notes

This document paraphrases and normalizes OSE SRD rules for app/test use. It intentionally uses internal app-like names where helpful. It does not include house rules.

Primary sources consulted:

- OSE SRD: Ability Scores
- OSE SRD: Creating a Character
- OSE SRD: Saving Throws
- OSE SRD: Time, Weight, Movement
- OSE SRD: Weapons and Armour
- OSE SRD: Alignment
- OSE SRD: Advancement
