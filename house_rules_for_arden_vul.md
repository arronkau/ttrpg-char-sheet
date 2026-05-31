# House Rules for App Correctness

This document records the campaign house rules that override or supplement baseline OSE rules for this app.

Use this document as a second rule layer on top of `ose_rules_for_app_correctness.md`.

- **Baseline layer:** OSE rules.
- **Override layer:** these house rules.
- **Conflict rule:** when this document conflicts with OSE, this document wins.
- **Scope note:** many rules are table procedures only. They should be visible in reference notes, campaign documentation, or referee-facing notes, but should not force app automation unless explicitly marked as mechanical.

## Internal Naming Notes

Use existing app/internal names where possible:

- `AbilityScores.strength`, `intelligence`, `wisdom`, `dexterity`, `constitution`, `charisma`
- `ClassDefinition.requirements`
- `ClassDefinition.prime_requisites`
- `ClassLevel.attack_modifier`
- `ClassLevel.thac0`
- `ClassLevel.hit_dice`
- `ClassLevel.saving_throws`
- `Entity.hp.currentHp`
- `Entity.hp.maxHp`
- `EntitySummary.armorClass`
- `EntitySummary.attackModifier`
- `EntitySummary.movementExploration`
- `EntitySummary.movementEncounter`
- `InventoryEntry.handSlot`
- `ItemTemplate.weapon.damage`
- `ItemTemplate.weapon.qualities`
- `ItemTemplate.armor.baseAcAscending`
- `ItemTemplate.armor.acBonus`
- `ItemTemplate.armor.magicAcBonus`
- `RestrictionWarning.source`

Recommended future abstraction:

```ts
type RulesetId = "ose" | "arden_vul_house";
```

The app should eventually resolve rules through a ruleset layer rather than hard-coding OSE or house-rule behavior into React display components.

## Mechanical Impact Summary

| Rule Area | Overrides OSE? | App Mechanical Change Required? | Notes |
|---|---:|---:|---|
| Class minimum ability requirements | Yes | Yes | Class selection should not be blocked by low abilities. |
| Prime requisite XP bonus | Yes | Yes | Do not calculate/apply XP bonuses from prime requisites. |
| Ascending Armor Class | Yes | Yes | App should use ascending AC only. |
| First-level minimum HP | Yes | Yes | Enforce minimum starting HP by class hit die. |
| Death's Door for PCs | Yes | Optional/Yes if combat state is tracked | Add state support if the app tracks PC injury state. |
| Retainers die at 0 HP | Yes | Optional/Yes if combat state is tracked | Different 0 HP handling by entity type. |
| Weapon damage by class hit die | Yes | Yes if damage is displayed/calculated | Weapon damage is not primarily determined by weapon damage die. |
| Weapon mastery damage scaling | Yes | Yes if damage is displayed/calculated | Damage scales by attack-bonus bracket. |
| Broader weapon use | Yes | Yes | Proficiency restrictions change. |
| Two-weapon attacking | Yes | Maybe | Mostly table-use unless app displays attack options/warnings. |
| Shield breakage | Yes | Maybe | Track shield destroyed/usable if equipment state is modeled. |
| Helmet rule | Yes | Maybe | Helmet does not affect AC; applies surprise penalty; can break on crit. |
| Thief backstab damage | Yes | Maybe | Only mechanical if app displays/calculates attack damage. |
| Fighter cleave | Yes | No/Maybe | Usually table procedure; could be class feature text. |
| D6 skills | Yes | Yes | Skill progression and display changes for listed classes. |
| Allowed classes | Yes | Yes | Character creation should limit class list. |
| Goblin modification | Yes | Yes | Replace Wolf Affinity with Listening at Doors. |
| Starting languages | Yes | Yes | Character creation/reference should use campaign language list. |
| Item-based encumbrance | Yes | Yes | Major inventory/movement rule layer. |
| Spell list consolidation | Yes | Yes | Illusionist/Necromancer-only spells join Magic-User list. |
| Magic-User starting spells | Yes | Maybe | Mechanical if the app generates starting spellbooks. |
| Detect Magic at will | Yes | No/Maybe | Reference rule; could appear in spellcasting notes. |
| Read Magic changes | Yes | No/Maybe | Reference rule; affects spellbook/scroll notes. |
| Transcription rules | Yes | No | Table procedure. |
| Ritual casting | Yes | Maybe | Reference rule; mechanical if app tracks available casting modes. |
| High-level scroll use | Yes | Maybe | Reference rule; mechanical if app validates scroll use. |
| Magical research | Yes | No | Table procedure/reference. |
| Turn Undead limitations | Yes | Maybe | Reference or mechanical if Turn Undead is modeled. |
| Feats of Exploration XP | Adds | Maybe/Yes if XP awards are tracked | Needs campaign XP award helper if automated. |
| Carousing / philanthropy XP | Adds | No/Maybe | Reference unless settlement downtime is tracked. |

## Core Rule Changes

### No Minimum Ability Score Requisites

#### Rule

Characters may play any allowed class regardless of ability scores.

#### OSE Override

OSE class minimum ability requirements are ignored.

#### App Mechanical Requirements

- Do not block class selection based on `ClassDefinition.requirements`.
- Do not emit an `illegal` `RestrictionWarning` for failing class ability minimums.
- If requirements are shown, label them as OSE reference only or suppress them for this ruleset.
- For this ruleset, ability requirements should not affect character validity.

#### Suggested Test Cases

```ts
expect(canSelectClass({ strength: 3 }, "fighter", "arden_vul_house")).toBe(true);
expect(getRestrictionWarnings(characterWithLowPrimeReq)).not.toContainEqual(
  expect.objectContaining({ severity: "illegal", source: "class" })
);
```

### No Prime Requisite XP Bonus

#### Rule

High prime requisite scores do not grant XP bonuses.

#### OSE Override

Ignore OSE XP adjustments from prime requisite scores.

#### App Mechanical Requirements

- Do not calculate XP bonus percentages from `ClassDefinition.prime_requisites`.
- Do not display a prime-requisite XP bonus as an active rule.
- XP gained should be recorded as awarded, without ability-score multipliers.

#### Suggested Test Cases

```ts
expect(getPrimeRequisiteXpModifier(character, "arden_vul_house")).toBe(0);
expect(applyXpAward(characterWithHighPrimeReq, 1000)).toEqual(1000);
```

### Ascending Armor Class

#### Rule

Use ascending Armor Class.

#### OSE Override

Descending AC should not be displayed as the primary AC value.

#### App Mechanical Requirements

- `EntitySummary.armorClass` should be ascending.
- `ItemTemplate.armor.baseAcAscending`, `acBonus`, and `magicAcBonus` should be interpreted as ascending AC fields.
- Shields add +1 AC unless broken/useless.
- Helmets add no AC.

#### Suggested Test Cases

```ts
expect(summary.armorClass).toBeGreaterThanOrEqual(10);
expect(equippingShield(baseAc10)).toEqual(11);
expect(equippingHelmet(baseAc10)).toEqual(10);
```

### First-Level Minimum Hit Points

#### Rule

A first-level character starts with a minimum hit point total equal to the average starting hit point roll:

| Hit Die | Minimum Starting HP |
|---:|---:|
| d4 | 3 |
| d6 | 4 |
| d8 | 5 |

#### OSE Override

A first-level PC cannot start below this minimum even if the rolled result is lower.

#### App Mechanical Requirements

- On first-level PC creation, `hp.maxHp` should be at least the minimum for the class hit die.
- `hp.currentHp` should normally initialize to the same value as `hp.maxHp`.
- This applies to PCs. The user did not specify whether retainers/hirelings receive the same minimum; safest assumption: apply to player characters only unless campaign setup says otherwise.

#### Suggested Implementation

```ts
function minimumStartingHp(hitDie: "d4" | "d6" | "d8"): number {
  if (hitDie === "d4") return 3;
  if (hitDie === "d6") return 4;
  if (hitDie === "d8") return 5;
  throw new Error("Unsupported hit die");
}
```

#### Suggested Test Cases

```ts
expect(createLevel1Pc({ hitDie: "d4", rolledHp: 1 }).hp.maxHp).toBe(3);
expect(createLevel1Pc({ hitDie: "d6", rolledHp: 2 }).hp.maxHp).toBe(4);
expect(createLevel1Pc({ hitDie: "d8", rolledHp: 3 }).hp.maxHp).toBe(5);
expect(createLevel1Pc({ hitDie: "d8", rolledHp: 8 }).hp.maxHp).toBe(8);
```

### Death's Door

#### Rule

When a PC drops to 0 HP, they are at Death's Door.

- PCs at Death's Door are unconscious.
- Each round, they have a 2-in-6 chance of dying.
- Instantaneous healing of any amount revives the PC to 1 HP.
- Once revived by healing, the PC is no longer at Death's Door.
- If an ally applies bandaging or other suitable triage for at least 1 turn, the wounded PC is no longer at Death's Door but remains unconscious.
- Bandaging cannot be performed during combat.
- Retainers still die outright at 0 HP.

#### OSE Override

PCs do not necessarily die immediately at 0 HP. Retainers still do.

#### App Mechanical Requirements

If the app tracks combat/injury state:

- Add or support a condition/state equivalent to `deaths_door`.
- Add or support an `unconscious` state.
- At `Entity.type === "character"` and `hp.currentHp <= 0`, apply Death's Door instead of immediate death.
- At `Entity.type === "retainer"` and `hp.currentHp <= 0`, mark dead or otherwise indicate death outright.
- Healing from Death's Door should set `hp.currentHp` to `1` even if the healing amount is greater or lower than 1, unless the table chooses to track full healing amount. The stated rule says revive to 1 HP.
- Triage should remove Death's Door but preserve unconsciousness.
- Do not automate the 2-in-6 death roll unless the app has an explicit combat round workflow. This is usually better as a visible reminder.

#### Suggested State Shape

```ts
type InjuryState =
  | "healthy"
  | "unconscious"
  | "deaths_door"
  | "dead";
```

Could also be modeled through `Entity.combatState.activeConditions`.

#### Suggested Test Cases

```ts
expect(applyDamage(pc, pc.hp.currentHp).combatState).toContain("deaths_door");
expect(applyDamage(retainer, retainer.hp.currentHp).combatState).toContain("dead");

const healed = applyHealing(pcAtDeathsDoor, 1);
expect(healed.hp.currentHp).toBe(1);
expect(healed.combatState).not.toContain("deaths_door");

const bandaged = applyTriage(pcAtDeathsDoor, { inCombat: false, durationTurns: 1 });
expect(bandaged.combatState).not.toContain("deaths_door");
expect(bandaged.combatState).toContain("unconscious");
```

## Weapon and Armor Changes

### Base Weapon Damage by Class Hit Die

#### Rule

A class's Hit Die determines base weapon damage.

Examples:

| Class Type | Hit Die | Base Weapon Damage |
|---|---:|---:|
| Fighter | d8 | 1d8 |
| Cleric | d6 | 1d6 |
| Magic-User | d4 | 1d4 |
| Thief | d4 | 1d4 |

#### OSE Override

Weapons are not primarily defined by their own OSE damage dice for character attacks. The class hit die drives base damage instead.

#### App Mechanical Requirements

If the app displays or calculates attack damage:

- Damage should be derived from class hit die and weapon mastery bracket, not only from `ItemTemplate.weapon.damage`.
- Weapon entries may still need `damage` for reference, monsters, optional modes, or data compatibility, but PC attack display should use house-rule damage.
- Damage derivation belongs in a rules module, not a component.

#### Suggested Test Cases

```ts
expect(getBaseWeaponDamage(fighter)).toBe("1d8");
expect(getBaseWeaponDamage(cleric)).toBe("1d6");
expect(getBaseWeaponDamage(magicUser)).toBe("1d4");
expect(getBaseWeaponDamage(thief)).toBe("1d4");
```

### Weapon Mastery Damage Scaling

#### Rule

At each Attack Bonus / THAC0 increase, base weapon damage improves by one bracket.

| Bracket | Damage |
|---:|---|
| 1st | `1dN`, where `N = class hit die size` |
| 2nd | `1 die type up`, e.g. `1d6 -> 1d8` |
| 3rd | `2dN` |
| 4th | `3dN` |
| 5th | `4dN` |

#### OSE Override

Weapon damage scales by attack progression.

#### App Mechanical Requirements

- Determine the character's current attack-bonus bracket from class progression.
- Bracket increases should correspond to each distinct increase in `ClassLevel.attack_modifier` or each THAC0 improvement if using `thac0`.
- OSE class tables may have repeated attack modifiers across multiple levels. Bracket should increase only when the attack bonus/THAC0 actually improves, not every level.
- Store no derived damage on the character unless needed for caching; calculate it from class level + ruleset.

#### Open Implementation Detail

The rule says “At each Attack Bonus (THAC0) increase.” This implies the damage bracket is keyed to the count of attack progression improvements, not to fixed character levels. If class tables differ, compute from progression data rather than hard-coded levels.

#### Suggested Test Cases

```ts
expect(getWeaponDamage({ hitDie: "d6", masteryBracket: 1 })).toBe("1d6");
expect(getWeaponDamage({ hitDie: "d6", masteryBracket: 2 })).toBe("1d8");
expect(getWeaponDamage({ hitDie: "d6", masteryBracket: 3 })).toBe("2d6");
expect(getWeaponDamage({ hitDie: "d6", masteryBracket: 4 })).toBe("3d6");
expect(getWeaponDamage({ hitDie: "d6", masteryBracket: 5 })).toBe("4d6");
```

### Weapon Use Restrictions

#### Rule

All classes can use all weapons, with these exceptions:

- Clerics may only use blunt weapons.
- Small races cannot use longbows.
- Small races cannot use two-handed swords.

#### OSE Override

OSE class weapon restrictions are replaced by this simpler rule.

#### App Mechanical Requirements

- Remove or suppress OSE weapon restriction warnings for most classes.
- Keep illegal/warning logic for:
  - cleric using non-blunt weapon;
  - small race using longbow;
  - small race using two-handed sword.
- Race/class entries must expose whether a character is “small” or otherwise list prohibited weapons.
- Weapon templates need reliable traits/categories such as `blunt`, `longbow`, `two_handed_sword`, or equivalent.

#### Suggested Test Cases

```ts
expect(canUseWeapon(fighter, sword)).toBe(true);
expect(canUseWeapon(magicUser, sword)).toBe(true);
expect(canUseWeapon(cleric, sword)).toBe(false);
expect(canUseWeapon(cleric, mace)).toBe(true);
expect(canUseWeapon(halfling, longbow)).toBe(false);
expect(canUseWeapon(halfling, twoHandedSword)).toBe(false);
```

### Altered Weapon Traits

#### Rule

Many weapon traits have been altered. See the Armor and Weapons List.

#### App Mechanical Requirements

- Do not infer final weapon behavior from OSE SRD traits alone.
- Treat the campaign Armor and Weapons List as the source of truth for weapon traits.
- Add tests from the campaign item data, not generic OSE assumptions.

#### Mechanical Note

This rule is important, but incomplete in this document because the actual altered trait list is external. Codex should not invent trait behavior.

### Two-Weapon Attacking

#### Rule

Classes with Strength or Dexterity as prime requisites can attack with two weapons.

Requirements:

- The class must have Strength or Dexterity as a prime requisite.
- Both weapons or the off-hand weapon must have the Light trait.
- Attacking with two weapons grants a single attack with Advantage.

#### OSE Override

This adds a house-rule combat option.

#### App Mechanical Requirements

If the app displays attack options:

- Identify whether the class has `strength` or `dexterity` in `ClassDefinition.prime_requisites`.
- Check equipped hand items.
- Confirm at least the off-hand weapon has `Light`, or both weapons satisfy the stated condition.
- Display a two-weapon attack option as one attack with Advantage.
- Do not add a second attack.

If the app does not model attacks, store this as class/combat reference text only.

#### Suggested Test Cases

```ts
expect(canTwoWeaponAttack(fighterWithStrPrimeReq, lightOffhand)).toBe(true);
expect(canTwoWeaponAttack(clericWithoutStrOrDexPrimeReq, lightOffhand)).toBe(false);
expect(getTwoWeaponAttackMode(validCharacter)).toEqual({
  attacks: 1,
  advantage: true
});
```

### Shields

#### Rule

A shield grants +1 AC. A shield can absorb the damage from a single blow, but is then rendered useless. Magic shields can absorb a number of blows equal to their enchantment bonus.

#### OSE Override

Adds shield breakage/damage absorption.

#### App Mechanical Requirements

- Shield AC bonus remains +1 unless the shield is broken/useless.
- Mundane shield absorption capacity: 1 blow.
- Magic shield absorption capacity: enchantment bonus.
- Once absorption capacity is spent, shield should no longer grant AC.
- Requires item state if tracked, e.g. `isBroken`, `absorptionsRemaining`, or `isDepleted`.

#### Suggested Test Cases

```ts
expect(getShieldAcBonus(normalShield)).toBe(1);
expect(getShieldAbsorptions(normalShield)).toBe(1);
expect(getShieldAbsorptions(magicShieldPlus2)).toBe(2);
expect(getShieldAcBonus(brokenShield)).toBe(0);
```

### Helmets

#### Rule

A helmet:

- does not provide a bonus to AC;
- can absorb the damage from a single critical hit;
- is then rendered useless;
- imposes a -1 penalty to Surprise.

#### OSE Override

Helmet behavior is not an AC bonus.

#### App Mechanical Requirements

- Helmet should not modify `EntitySummary.armorClass`.
- If surprise is calculated or displayed, apply `-1` penalty while wearing a usable helmet.
- If item state is tracked, helmet should have one critical-hit absorption before becoming useless.
- If the app does not calculate surprise, display the penalty in equipment notes.

#### Suggested Test Cases

```ts
expect(getHelmetAcBonus(helmet)).toBe(0);
expect(getSurpriseModifier(characterWearingHelmet)).toBe(-1);
expect(getHelmetCriticalAbsorptions(helmet)).toBe(1);
```

## Class Modifications

### Thief Backstab

#### Rule

A Thief who successfully backstabs deals flat damage:

```txt
12 + STR modifier
```

#### OSE Override

Backstab does not use OSE multiplier behavior.

#### App Mechanical Requirements

If the app displays/calculates attacks:

- For Thief Backstab, ignore weapon damage.
- Apply `12 + strengthModifier`.
- Use the house-rule ability modifier table/rules currently active for the campaign. If OSE modifiers are still used, this is the OSE STR modifier.

#### Suggested Test Cases

```ts
expect(getThiefBackstabDamage({ strengthModifier: -1 })).toBe(11);
expect(getThiefBackstabDamage({ strengthModifier: 0 })).toBe(12);
expect(getThiefBackstabDamage({ strengthModifier: 2 })).toBe(14);
```

### Fighter Cleave

#### Rule

Fighters only gain Cleave.

If a fighter inflicts enough melee damage to reduce an opponent's HP to 0 or fewer, the fighter can immediately attack another opponent within melee range using the same weapon. This can continue as long as each attack reduces a new opponent to 0 HP or fewer.

#### OSE Override

Adds a Fighter-only combat ability.

#### App Mechanical Requirements

- Usually no app automation required.
- Add to Fighter class feature text/reference.
- If attack workflow is ever automated, Cleave must:
  - apply only to Fighters;
  - require melee damage;
  - require reducing the target to 0 HP or fewer;
  - require a new opponent within melee range;
  - reuse the same weapon;
  - continue while the condition is met.

### D6 Skills

#### Rule

Thieves, Acolytes, Acrobats, Assassins, and Mages use the D6 Thief Skills alternate system from Carcass Crawler Issue #1, modified.

No skill using this system can ever increase beyond a 5-in-6 chance.

#### OSE Override

Percentage-based skill progressions are replaced for these classes, except where noted.

#### App Mechanical Requirements

- Skill display for these classes should show `X-in-6`, not percentages.
- Cap all D6 skill values at 5.
- App should not allow allocation above 5-in-6.
- Acolyte Turn Undead remains percentage-based because undead type directly modifies the percentage.
- Existing `ClassDefinition.feature_progression.expertise_points` and `skills.allocatedPoints` appear suitable, but should enforce the cap.

#### Suggested Test Cases

```ts
expect(formatSkillChance({ system: "d6", value: 3 })).toBe("3-in-6");
expect(allocateSkillPoint(skillAt5)).toEqual({ ok: false });
expect(formatSkillChance({ skillId: "turn_undead", classId: "acolyte" })).toContain("%");
```

### Expertise Point Progression

#### Rule

| Class | 1st Level Expertise Points | Later Progression |
|---|---:|---|
| Thief | 6 | +2 every level thereafter |
| Acolyte | 1 | +3 every even level thereafter |
| Acrobat | 4 | +1 every level thereafter |
| Assassin | 3 | +1 every level thereafter, except levels 5, 10, and 14 |
| Mage | 7 | +1 every level thereafter |

#### App Mechanical Requirements

- Store class-specific expertise progression in class data or a rules module.
- Character skill allocation should validate total allocated points against class and level.
- Validate D6 skills against 5-in-6 max.

#### Suggested Total Expertise Formulae

These formulae return total points available at a given level.

```ts
function thiefExpertise(level: number) {
  return 6 + Math.max(0, level - 1) * 2;
}

function acolyteExpertise(level: number) {
  return 1 + Math.floor(level / 2) * 3;
}

function acrobatExpertise(level: number) {
  return 4 + Math.max(0, level - 1);
}

function assassinExpertise(level: number) {
  const skipped = [5, 10, 14].filter((l) => l <= level).length;
  return 3 + Math.max(0, level - 1) - skipped;
}

function mageExpertise(level: number) {
  return 7 + Math.max(0, level - 1);
}
```

#### Suggested Test Cases

```ts
expect(getExpertisePoints("thief", 1)).toBe(6);
expect(getExpertisePoints("thief", 2)).toBe(8);

expect(getExpertisePoints("acolyte", 1)).toBe(1);
expect(getExpertisePoints("acolyte", 2)).toBe(4);
expect(getExpertisePoints("acolyte", 3)).toBe(4);
expect(getExpertisePoints("acolyte", 4)).toBe(7);

expect(getExpertisePoints("acrobat", 1)).toBe(4);
expect(getExpertisePoints("acrobat", 3)).toBe(6);

expect(getExpertisePoints("assassin", 1)).toBe(3);
expect(getExpertisePoints("assassin", 4)).toBe(6);
expect(getExpertisePoints("assassin", 5)).toBe(6);
expect(getExpertisePoints("assassin", 10)).toBe(10);
expect(getExpertisePoints("assassin", 14)).toBe(13);

expect(getExpertisePoints("mage", 1)).toBe(7);
expect(getExpertisePoints("mage", 3)).toBe(9);
```

## Campaign Setting Adaptations

### Allowed Classes

#### Rule

Allowed classes:

- Acolyte
- Acrobat
- Assassin
- Cleric
- Dwarf
- Fighter
- Goblin
- Half-Elf
- Halfling
- Mage
- Magic-User
- Thief

#### OSE Override

Only these classes should be offered for this campaign ruleset.

#### App Mechanical Requirements

- Character creation should only list these classes.
- Existing classes outside this list should be hidden, disabled, or marked unavailable for this campaign.
- Do not delete unsupported class data if it is useful for other rulesets.

#### Suggested Test Case

```ts
expect(getAllowedClasses("arden_vul_house").map((c) => c.id).sort()).toEqual([
  "acolyte",
  "acrobat",
  "assassin",
  "cleric",
  "dwarf",
  "fighter",
  "goblin",
  "half_elf",
  "halfling",
  "mage",
  "magic_user",
  "thief"
].sort());
```

### Goblin Modification

#### Rule

Goblins use the Carcass Crawler Issue #1 class, except:

- Replace `Wolf Affinity` with `Listening at Doors`, as described under the Dwarf class entry.

#### App Mechanical Requirements

- Goblin class feature text should not include Wolf Affinity for this campaign.
- Goblin should include Listening at Doors.
- If skills are modeled, Goblin should have the appropriate Listening at Doors skill/entry.

#### Suggested Test Cases

```ts
expect(getClassFeatures("goblin")).not.toContain("Wolf Affinity");
expect(getClassFeatures("goblin")).toContain("Listening at Doors");
```

### Mage and Acolyte Sources

#### Rule

Mage and Acolyte classes are from Carcass Crawler Issue #1.

#### App Mechanical Requirements

- Class data should include Mage and Acolyte.
- Their class data should use the house-rule skill system described above.
- Do not treat Mage as merely a display alias for Magic-User unless the class data actually matches.

### Starting Languages

#### Rule

Starting languages:

- Archontean
- Native Cultural
- extra languages based on Intelligence score

Extra languages may be chosen from:

- Mithric
- Thorcin
- Wiskin
- Khumus
- Elf
- Dwarf
- Goblin
- Halfling

#### OSE Override

Replaces default OSE language assumptions for this campaign.

#### App Mechanical Requirements

- Character creation should include Archontean and Native Cultural by default.
- The number of additional language choices should be derived from Intelligence according to the active language/INT rule.
- Restrict additional language choices to the campaign list above unless the referee manually overrides.
- Ensure spelling is consistent. User uses “Mithric” here; previous campaign material may use “Mythric.” Treat this as needing normalization before hard-coding.

#### Open Data Issue

`Mithric` vs `Mythric` appears inconsistent across campaign materials. Codex should not silently create both as separate languages. Pick one canonical ID and support aliases if needed.

#### Suggested Test Cases

```ts
expect(getStartingLanguages(character)).toContain("Archontean");
expect(getStartingLanguages(character)).toContain("Native Cultural");
expect(getAvailableBonusLanguages()).toEqual([
  "Mithric",
  "Thorcin",
  "Wiskin",
  "Khumus",
  "Elf",
  "Dwarf",
  "Goblin",
  "Halfling"
]);
```

### Expanded Adventuring Gear List

#### Rule

Use the expanded adventuring gear list from Carcass Crawler Issue #3.

#### App Mechanical Requirements

- Campaign item catalog should include the expanded gear list.
- Do not rely only on the OSE Basic/Advanced equipment list for this campaign.
- Item data should remain data-driven.

## Spellcasting

### Magic-User Spell List Consolidation

#### Rule

Spells unique to Necromancer and Illusionist classes are subsumed into the Magic-User spell list at their listed levels.

Necromancers and Illusionists are not separate classes.

#### OSE Override

The Magic-User list is expanded. Necromancer and Illusionist are removed as class choices.

#### App Mechanical Requirements

- Do not offer Necromancer or Illusionist as classes.
- Include their unique spells in the Magic-User spell list.
- Preserve listed spell levels.
- Spell filtering should show these spells under Magic-User.
- If source class metadata is retained, mark source/origin separately from playable class availability.

#### Suggested Test Cases

```ts
expect(getAllowedClasses("arden_vul_house")).not.toContain("necromancer");
expect(getAllowedClasses("arden_vul_house")).not.toContain("illusionist");
expect(getSpellList("magic_user")).toContainEqual(
  expect.objectContaining({ sourceList: expect.stringMatching(/illusionist|necromancer/i) })
);
```

### Magic-User Starting Spellbook

#### Rule

New Magic-Users begin with:

- four random Level 1 spells;
- Read Magic in addition to those four spells.

#### OSE Override

This changes starting spellbook contents.

#### App Mechanical Requirements

If the app generates new characters:

- New Magic-Users should have exactly four random level 1 spells plus Read Magic.
- Read Magic should not count against the four random spells.
- Avoid duplicate random spells.
- Random generation should be explicit/user-triggered or reproducible in tests.

#### Suggested Test Cases

```ts
const spellbook = generateStartingSpellbook("magic_user", seededRng);
expect(spellbook).toContain("read_magic");
expect(spellbook.filter(isLevel1MagicUserSpell)).toHaveLength(5);
expect(new Set(spellbook).size).toBe(spellbook.length);
```

### Detect Magic At Will

#### Rule

All Magic-Users can detect magical resonance at will, provided:

- the caster can concentrate without distraction;
- the caster physically touches the subject;
- only the existence of magic is detected;
- nature and strength are not detected;
- each attempt requires one turn.

#### App Mechanical Requirements

- Usually reference text only.
- Add to Magic-User spellcasting notes or class feature text.
- If the app tracks turns/actions, this can be represented as a one-turn action.

### Read Magic

#### Rule

- Read Magic is not necessary to decipher scrolls.
- Read Magic is necessary to decipher spellbooks.

#### App Mechanical Requirements

- Usually reference text only.
- If scroll/spellbook deciphering is modeled:
  - scroll deciphering should not require Read Magic;
  - spellbook deciphering should require Read Magic.

### Spell Transcription

#### Rule

Transcribing spells from a spellbook or scroll to another spellbook:

- requires proper tools;
- takes one uninterrupted hour per spell level per spell;
- has no chance of failure unless interrupted;
- automatically fails if interrupted;
- can be attempted again without restriction.

#### App Mechanical Requirements

- Reference text only unless downtime tools are implemented.
- If downtime tools are implemented, transcription duration is:

```txt
hours = spell level
```

### Ritual Casting

#### Rule

Magic-Users may cast spells from their own spellbook beyond slot capacity, but not beyond level limit, by spending:

```txt
1 uninterrupted turn per spell level
```

Examples:

| Spell Level | Ritual Casting Time |
|---:|---:|
| 1 | 1 turn |
| 2 | 2 turns |
| 3 | 3 turns |
| 4 | 4 turns |
| 5 | 5 turns |
| 6 | 6 turns |

#### App Mechanical Requirements

- Reference text if the app only tracks memorized/expended spells.
- If casting options are displayed:
  - allow ritual casting from owned spellbook;
  - do not require available spell slot;
  - require caster to be high enough level to cast that spell level;
  - show time cost in turns.

#### Suggested Test Cases

```ts
expect(canRitualCast({ casterLevelAllowsSpell: true, inOwnSpellbook: true, slotsAvailable: 0 })).toBe(true);
expect(canRitualCast({ casterLevelAllowsSpell: false, inOwnSpellbook: true, slotsAvailable: 0 })).toBe(false);
expect(getRitualCastingTurns(3)).toBe(3);
```

### Higher-Level Scroll Use

#### Rule

Scrolls of a higher level than the caster's capability can be cast by any appropriate class at any class level, but they cannot be copied into spellbooks.

#### OSE Override

Relaxes scroll casting level limits while restricting copying.

#### App Mechanical Requirements

If scroll use/copying is validated:

- Allow appropriate class to cast higher-level scrolls.
- Do not allow higher-level scrolls to be copied into spellbooks if beyond caster capability.
- “Appropriate class” means the spell belongs to a spell list the class can use.

#### Suggested Test Cases

```ts
expect(canCastScroll(level1MagicUser, level3MagicUserScroll)).toBe(true);
expect(canCopyScrollToSpellbook(level1MagicUser, level3MagicUserScroll)).toBe(false);
```

### Magical Research

#### Creating New Spells

##### Rule

Creating a new spell requires:

- one uninterrupted day per spell level per spell;
- proper tools;
- 1000 gp per spell level per spell;
- applies to both arcane and divine spells.

##### App Mechanical Requirements

Reference only unless downtime/research is tracked.

##### Formula

```txt
researchDays = spellLevel
researchCostGp = spellLevel * 1000
```

#### Creating Magic Items

##### Rule

Standard OSE rules apply, except all casters can attempt to create items at any level.

##### App Mechanical Requirements

Reference only unless item creation is tracked.

### Turn Undead

#### Rule

All optional limitations for Turning Undead from the Advanced Fantasy Player's Tome are in effect.

Turning Undead counts as Spellcasting with regard to Declarations in Combat.

#### App Mechanical Requirements

- Usually reference text only.
- If declarations are tracked, Turn Undead should be categorized as spellcasting.
- Acolyte Turn Undead remains percentage-based, not D6 skill-based.


## Codex-Ready Implementation Prompt

### Task

Create a separate `arden_vul_house` ruleset layer that overrides baseline OSE behavior according to `docs/house_rules_for_app_correctness.md`. Do not hard-code house rules into React components.

### Context

The app currently tracks OSE-style characters, classes, inventory, armor, movement, spells, and summaries. The campaign uses OSE as a baseline, but the house rules in this document override OSE where they conflict. Many house rules are table-facing only and should be represented as notes rather than automated.

### Scope

Implement only the mechanical rules that the current app already has data structures to support, or that can be added with minimal targeted changes.

Prioritize:

1. no class ability minimum enforcement;
2. no prime requisite XP bonus;
3. ascending AC only;
4. first-level HP minimums;
5. allowed class filtering;
6. campaign language defaults/list;
7. D6 skill progression/caps for relevant classes;
8. weapon restriction overrides;
9. helmet no-AC behavior;
10. shield +1 AC behavior;
11. item-based encumbrance hooks if the app already has slot-based infrastructure;
12. Magic-User spell list consolidation if spell data already exists.

### Requirements

- Add or use a `RulesetId`-style selector.
- Keep baseline OSE rules intact for future rulesets.
- Do not place rule calculations in display components.
- Add unit tests for each implemented mechanical override.
- Where a rule cannot be implemented because source data is absent, add a clear TODO and a failing test only if the missing data is expected to exist.
- Preserve existing data shape unless a small, justified type addition is needed.
- Do not implement combat automation beyond state/display helpers unless already present.

### Non-goals

- Do not implement a dice roller.
- Do not automate full combat.
- Do not automate leveling decisions.
- Do not automate spell effects.
- Do not refactor unrelated UI.
- Do not introduce a general-purpose multi-system framework beyond the minimal ruleset boundary needed now.

### Likely Files

Exact file names may differ. Inspect the repo first.

Likely areas:

- `src/types.ts`
- `src/store/*`
- `src/data/classes*`
- `src/data/items*`
- `src/data/spells*`
- `src/utils/*`
- `src/rules/*` if present
- `src/**/*.test.ts`
- character creation components
- character summary selectors
- inventory/encumbrance selectors
- spell catalog selectors
- class/skill utilities

### Validation

Run:

```bash
npm test
npm run build
```

If Firestore/security changes are involved, also run:

```bash
npm run test:firestore
```

### Acceptance Criteria

- A low-ability character can select any allowed class.
- No prime requisite XP bonus is calculated or displayed as active.
- AC is ascending and helmets do not increase AC.
- A shield grants +1 AC while usable.
- First-level PCs cannot start below the house-rule HP minimum.
- Allowed class list exactly matches the campaign list.
- Goblin class does not include Wolf Affinity and does include Listening at Doors.
- D6 skills display as `X-in-6` and cannot exceed `5-in-6`.
- Acolyte Turn Undead remains percentage-based.
- Magic-User spell list includes appropriate Illusionist/Necromancer-only spells if spell data supports it.
- New Magic-User spellbooks include four random level 1 spells plus Read Magic if character generation supports spellbook initialization.
- Tests cover implemented ruleset overrides.

### Stop Condition

Stop after implementing the smallest coherent ruleset layer and tests for the currently supported mechanics. Do not continue into broad architecture redesign, full combat automation, downtime systems, dice rolling, or unrelated UI cleanup.
