export type MuscleSlug = (typeof muscles)[number]["slug"];

export const muscles = [
  { slug: "chest", name: "Chest", region: "upper" },
  { slug: "upper-chest", name: "Upper chest", region: "upper" },
  { slug: "front-delts", name: "Front delts", region: "upper" },
  { slug: "side-delts", name: "Side delts", region: "upper" },
  { slug: "rear-delts", name: "Rear delts", region: "upper" },
  { slug: "lats", name: "Lats", region: "upper" },
  { slug: "upper-back", name: "Upper back", region: "upper" },
  { slug: "traps", name: "Traps", region: "upper" },
  { slug: "lower-back", name: "Lower back", region: "core" },
  { slug: "biceps", name: "Biceps", region: "upper" },
  { slug: "triceps", name: "Triceps", region: "upper" },
  { slug: "forearms", name: "Forearms", region: "upper" },
  { slug: "abs", name: "Abs", region: "core" },
  { slug: "obliques", name: "Obliques", region: "core" },
  { slug: "quads", name: "Quadriceps", region: "lower" },
  { slug: "hamstrings", name: "Hamstrings", region: "lower" },
  { slug: "glutes", name: "Glutes", region: "lower" },
  { slug: "adductors", name: "Adductors", region: "lower" },
  { slug: "abductors", name: "Abductors", region: "lower" },
  { slug: "calves", name: "Calves", region: "lower" },
] as const;

export const equipmentList = [
  { slug: "barbell", name: "Barbell" },
  { slug: "dumbbell", name: "Dumbbell" },
  { slug: "kettlebell", name: "Kettlebell" },
  { slug: "cable", name: "Cable" },
  { slug: "machine", name: "Machine" },
  { slug: "smith-machine", name: "Smith machine" },
  { slug: "ez-bar", name: "EZ bar" },
  { slug: "trap-bar", name: "Trap bar" },
  { slug: "bodyweight", name: "Bodyweight" },
  { slug: "pull-up-bar", name: "Pull-up bar" },
  { slug: "dip-station", name: "Dip station" },
  { slug: "resistance-band", name: "Resistance band" },
  { slug: "cardio-machine", name: "Cardio machine" },
  { slug: "none", name: "None" },
] as const;

export type EquipmentSlug = (typeof equipmentList)[number]["slug"];
