// Default meals — Breakfast, Lunch, Dinner. No food items: every day starts
// empty and the user adds foods, pinning the regular ones to carry forward.
// Meals are user-editable (add / remove / rename / set time) and apply to all
// days; this is just the starting set on first run.

export const DEFAULT_MEALS = [
  { id: "breakfast", label: "Breakfast", emoji: "🌅", time: "" },
  { id: "lunch",     label: "Lunch",     emoji: "☀️", time: "" },
  { id: "dinner",    label: "Dinner",    emoji: "🌙", time: "" },
];

export const MEAL_EMOJI_CHOICES = ["🌅","☀️","🌙","🥜","🍎","🥤","🍵","🌃","🏋️","🥗","🍽️","⭐"];

export const DEFAULT_TARGETS = {
  protein: 175,
  kcal:    2425,
  satFat:  20,
  fibre:   35,
  iron:    19,
  calcium: 1000,
  b12:     2.4,
  vitC:    65,
  vitD:    15,
  zinc:    11,
};
