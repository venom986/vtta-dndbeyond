import utils from "../../utils.js";
import logger from "../../logger.js";

/**
 * Get the scaling type for a spell mod
 * This is complex logic and is broken out to help simplify
 * @param {*} name
 * @param {*} mod
 */
let getScaleType = (name, mod) => {
  // scaleTypes:
  // SPELLSCALE - typical spells that scale
  // SPELLLEVEL - these spells have benefits that come in at particular levels e.g. bestow curse, hex. typically  duration changes
  // CHARACTERLEVEL - typical cantrip based levelling, some expections (eldritch blast)
  let scaleType = null;
  const modScaleType = mod.atHigherLevels.scaleType;
  const isHigherLevelDefinitions =
    mod.atHigherLevels.higherLevelDefinitions &&
    Array.isArray(mod.atHigherLevels.higherLevelDefinitions) &&
    mod.atHigherLevels.higherLevelDefinitions.length >= 1;

  if (isHigherLevelDefinitions && modScaleType === "spellscale") {
    const definition = mod.atHigherLevels.higherLevelDefinitions[0];
    if (definition) {
      scaleType = modScaleType;
    } else {
      utils.log("No definition found for " + name); // eslint-disable-line no-console
    }
  } else if (modScaleType === "spellscale") {
    // lets handle cases where there is a spellscale type but no damage
    // increase/ higherleveldefinitins e.g. chain lighting
    // these type of spells typically increase targets so we set the
    // scaling to null as we don't want to increase damage when upcast.
    // this also deals with cases like Ice Knife where the upscale damage
    // is in one of the two mods provided.
    // we are capturing this else because we don't want to trigger
    // an update to scaleType or a warning.
  } else if (modScaleType === "characterlevel") {
    // lets handle odd cantrips like Eldritch Blast
    // (in fact this might be the only case)
    if (mod.atHigherLevels.higherLevelDefinitions.length === 0) {
      // if this array is empty it does not contain levelling information
      // the only case found is Eldritch Blast.
      // this does have some info around multiple beams in
      // data.atHigherLevels but we ignore this. we will set the scaling
      // to null as each beam is best modelled by "casting" the cantrip again/
      // pressing the attack/damage buttons in FVTT
      scaleType = null;
    } else {
      scaleType = modScaleType;
    }
  } else if (modScaleType === "spelllevel") {
    // spells that have particular level associated benefits
    // these seem to be duration increases or target increases for
    // the most part we can't handle these in FVTT right now (we could
    // in theory create a new spell at a higher level).
    // some duration upcasting (like bestow curse) affects concentration
    // for now we will do nothing with these spells.
    // examples include: hex, shadowblade, magic weapon, bestow curse
    scaleType = modScaleType;
  } else {
    utils.log(name + " parse failed: " + JSON.stringify(modScaleType));
    scaleType = modScaleType; // if this is new/unknow will use default
  }

  return scaleType;
};

export function getSpellScaling(data) {
  let baseDamage = "";
  let scaleDamage = "";
  let scaleType = null; // defaults to null, so will be picked up as a None scaling spell.

  // spell scaling
  if (data.definition.canCastAtHigherLevel) {
    // iterate over each spell modifier
    data.definition.modifiers
      .filter((mod) => mod.type === "damage" || (mod.type === "bonus" && mod.subType === "hit-points"))
      .forEach((mod) => {
        // if the modifier has a die for damage, lets use the string or fixed value
        // for the base damage
        if (mod && mod.die) {
          if (mod.die.diceString !== null) {
            baseDamage = mod.die.diceString;
          }

          if (mod.die.fixedValue !== null && baseDamage === "") {
            baseDamage = mod.die.fixedValue;
          }
        }

        // defines some details about higher level casting
        if (mod.atHigherLevels) {
          // scaleTypes:
          // SPELLSCALE - typical spells that scale
          // SPELLLEVEL - these spells have benefits that come in at particular levels e.g. bestow curse, hex. typically  duration changes
          // CHARACTERLEVEL - typical cantrip based levelling, some expections (eldritch blast)

          // mod.atHigherLevels.higherLevelDefinitions contains info about the
          // spells damage die at higher levels, but we can't use this for cantrips as
          // FVTT use a formula to work out the scaling (ddb has a fixed value structure)
          const isHigherLevelDefinitions =
            mod.atHigherLevels.higherLevelDefinitions &&
            Array.isArray(mod.atHigherLevels.higherLevelDefinitions) &&
            mod.atHigherLevels.higherLevelDefinitions.length >= 1;

          // lets handle normal spell leveling first
          if (isHigherLevelDefinitions && mod.atHigherLevels.scaleType === "spellscale") {
            const definition = mod.atHigherLevels.higherLevelDefinitions[0];
            if (definition) {
              const modScaleDamage =
                definition.dice && definition.dice.diceString // if dice string
                  ? definition.dice.diceString // use dice string
                  : definition.dice && definition.dice.fixedValue // else if fixed value
                    ? definition.dice.fixedValue // use fixed value
                    : definition.value; // else use value

              // some spells have multiple scaling damage (e.g. Wall of Ice,
              // Glyph of warding, Acid Arrow, Arcane Hand, Dragon's Breath,
              // Chromatic Orb, Absorb Elements, Storm Sphere, Spirit Guardians)
              // it's hard to model most of these in FVTT, and for some it makes
              // no difference. so...
              // lets optimistically use the highest
              // assumptions: these are going to be dice strings, and we don't care
              // about dice value, just number of dice
              const diceFormula = /(\d*)d\d*/;
              const existingMatch = diceFormula.exec(scaleDamage);
              const modMatch = diceFormula.exec(modScaleDamage);

              if (!existingMatch || modMatch[1] > existingMatch[1]) {
                scaleDamage = modScaleDamage;
              }
            } else {
              logger.warn("No definition found for " + data.definition.name);
            }
          }

          scaleType = getScaleType(data.definition.name, mod);
        }
      });
  }

  switch (scaleType) {
    case "characterlevel":
      return {
        mode: "cantrip",
        formula: "",
      };
    case "spellscale":
      return {
        mode: "level",
        formula: scaleDamage,
      };
    case "spelllevel":
    case null:
      return {
        mode: "none",
        formula: "",
      };
    default:
      return {
        mode: "level",
        formula: "",
      };
  }
}
