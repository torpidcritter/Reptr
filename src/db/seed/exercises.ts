import type { EquipmentSlug, MuscleSlug } from "./muscles";

type Category =
  "resistance" | "bodyweight" | "cardio" | "mobility" | "stretching" | "plyometrics" | "functional";
type Measurement = "weight_reps" | "reps" | "assisted_reps" | "time" | "distance_time";

export interface SeedExercise {
  slug: string;
  name: string;
  equipment: EquipmentSlug;
  pattern: string;
  category: Category;
  measurement: Measurement;
  unilateral: boolean;
  /** 0–1 share of the work each muscle does. 0.75 and above counts as a primary muscle. */
  muscles: Partial<Record<MuscleSlug, number>>;
}

type Opts = Partial<Pick<SeedExercise, "category" | "measurement" | "unilateral">>;

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function x(
  name: string,
  equipment: EquipmentSlug,
  pattern: string,
  muscles: SeedExercise["muscles"],
  opts: Opts = {},
): SeedExercise {
  return {
    slug: slugify(name),
    name,
    equipment,
    pattern,
    category: opts.category ?? "resistance",
    measurement: opts.measurement ?? "weight_reps",
    unilateral: opts.unilateral ?? false,
    muscles,
  };
}

const bw = { category: "bodyweight", measurement: "reps" } as const;
const uni = { unilateral: true } as const;
const timed = { category: "bodyweight", measurement: "time" } as const;
const cardio = { category: "cardio", measurement: "distance_time" } as const;

const PRESS = { "front-delts": 0.5, triceps: 0.5 } as const;
const PULL = { biceps: 0.5, "rear-delts": 0.3, forearms: 0.25 } as const;

export const exercises: SeedExercise[] = [
  // Chest
  x("Barbell Bench Press", "barbell", "horizontal push", { chest: 1, ...PRESS }),
  x("Incline Barbell Bench Press", "barbell", "incline push", {
    "upper-chest": 1,
    chest: 0.5,
    "front-delts": 0.6,
    triceps: 0.5,
  }),
  x("Decline Barbell Bench Press", "barbell", "horizontal push", {
    chest: 1,
    triceps: 0.5,
    "front-delts": 0.3,
  }),
  x("Close-Grip Bench Press", "barbell", "horizontal push", {
    triceps: 1,
    chest: 0.6,
    "front-delts": 0.4,
  }),
  x("Dumbbell Bench Press", "dumbbell", "horizontal push", { chest: 1, ...PRESS }),
  x("Incline Dumbbell Press", "dumbbell", "incline push", {
    "upper-chest": 1,
    chest: 0.5,
    "front-delts": 0.6,
    triceps: 0.5,
  }),
  x("Decline Dumbbell Press", "dumbbell", "horizontal push", {
    chest: 1,
    triceps: 0.5,
    "front-delts": 0.3,
  }),
  x("Smith Machine Bench Press", "smith-machine", "horizontal push", { chest: 1, ...PRESS }),
  x("Smith Machine Incline Press", "smith-machine", "incline push", {
    "upper-chest": 1,
    chest: 0.5,
    "front-delts": 0.6,
    triceps: 0.5,
  }),
  x("Machine Chest Press", "machine", "horizontal push", { chest: 1, ...PRESS }),
  x("Incline Machine Press", "machine", "incline push", {
    "upper-chest": 1,
    chest: 0.5,
    "front-delts": 0.6,
    triceps: 0.4,
  }),
  x("Dumbbell Fly", "dumbbell", "chest fly", { chest: 1, "front-delts": 0.3 }),
  x("Incline Dumbbell Fly", "dumbbell", "chest fly", {
    "upper-chest": 1,
    chest: 0.5,
    "front-delts": 0.3,
  }),
  x("Cable Fly", "cable", "chest fly", { chest: 1, "front-delts": 0.3 }),
  x("Low-to-High Cable Fly", "cable", "chest fly", {
    "upper-chest": 1,
    chest: 0.4,
    "front-delts": 0.4,
  }),
  x("High-to-Low Cable Fly", "cable", "chest fly", { chest: 1, "front-delts": 0.2 }),
  x("Pec Deck", "machine", "chest fly", { chest: 1, "front-delts": 0.2 }),
  x("Push-Up", "bodyweight", "horizontal push", { chest: 1, ...PRESS, abs: 0.2 }, bw),
  x("Incline Push-Up", "bodyweight", "horizontal push", { chest: 1, ...PRESS }, bw),
  x(
    "Decline Push-Up",
    "bodyweight",
    "incline push",
    { "upper-chest": 1, chest: 0.6, "front-delts": 0.6, triceps: 0.5 },
    bw,
  ),
  x(
    "Diamond Push-Up",
    "bodyweight",
    "horizontal push",
    { triceps: 1, chest: 0.6, "front-delts": 0.4 },
    bw,
  ),
  x(
    "Chest Dip",
    "dip-station",
    "vertical push",
    { chest: 1, triceps: 0.6, "front-delts": 0.5 },
    bw,
  ),
  x("Weighted Dip", "dip-station", "vertical push", { chest: 1, triceps: 0.7, "front-delts": 0.5 }),

  // Back
  x("Deadlift", "barbell", "hinge", {
    hamstrings: 0.8,
    glutes: 0.9,
    "lower-back": 1,
    traps: 0.5,
    lats: 0.3,
    forearms: 0.5,
    quads: 0.4,
  }),
  x("Trap Bar Deadlift", "trap-bar", "hinge", {
    quads: 0.8,
    glutes: 1,
    hamstrings: 0.6,
    "lower-back": 0.7,
    traps: 0.5,
    forearms: 0.5,
  }),
  x("Rack Pull", "barbell", "hinge", {
    "lower-back": 1,
    traps: 0.8,
    glutes: 0.6,
    hamstrings: 0.4,
    forearms: 0.6,
  }),
  x("Pull-Up", "pull-up-bar", "vertical pull", { lats: 1, "upper-back": 0.5, ...PULL }, bw),
  x(
    "Chin-Up",
    "pull-up-bar",
    "vertical pull",
    { lats: 1, biceps: 0.7, "upper-back": 0.4, forearms: 0.3 },
    bw,
  ),
  x("Weighted Pull-Up", "pull-up-bar", "vertical pull", { lats: 1, "upper-back": 0.5, ...PULL }),
  x(
    "Assisted Pull-Up",
    "machine",
    "vertical pull",
    { lats: 1, "upper-back": 0.5, ...PULL },
    { measurement: "assisted_reps" },
  ),
  x("Lat Pulldown", "cable", "vertical pull", { lats: 1, "upper-back": 0.4, ...PULL }),
  x("Close-Grip Lat Pulldown", "cable", "vertical pull", {
    lats: 1,
    biceps: 0.6,
    "upper-back": 0.4,
  }),
  x(
    "Single-Arm Lat Pulldown",
    "cable",
    "vertical pull",
    { lats: 1, biceps: 0.5, "upper-back": 0.3 },
    uni,
  ),
  x("Straight-Arm Pulldown", "cable", "shoulder extension", { lats: 1, triceps: 0.2, abs: 0.2 }),
  x("Barbell Row", "barbell", "horizontal pull", {
    "upper-back": 1,
    lats: 0.8,
    "lower-back": 0.4,
    ...PULL,
  }),
  x("Pendlay Row", "barbell", "horizontal pull", {
    "upper-back": 1,
    lats: 0.8,
    "lower-back": 0.4,
    ...PULL,
  }),
  x("Dumbbell Row", "dumbbell", "horizontal pull", { lats: 1, "upper-back": 0.8, ...PULL }, uni),
  x("Chest-Supported Dumbbell Row", "dumbbell", "horizontal pull", {
    "upper-back": 1,
    lats: 0.7,
    ...PULL,
  }),
  x("Seated Cable Row", "cable", "horizontal pull", { "upper-back": 1, lats: 0.8, ...PULL }),
  x("Wide-Grip Cable Row", "cable", "horizontal pull", {
    "upper-back": 1,
    "rear-delts": 0.5,
    lats: 0.5,
    biceps: 0.4,
  }),
  x("T-Bar Row", "barbell", "horizontal pull", {
    "upper-back": 1,
    lats: 0.8,
    "lower-back": 0.3,
    ...PULL,
  }),
  x("Machine Row", "machine", "horizontal pull", { "upper-back": 1, lats: 0.7, ...PULL }),
  x("Seal Row", "barbell", "horizontal pull", { "upper-back": 1, lats: 0.7, ...PULL }),
  x("Inverted Row", "bodyweight", "horizontal pull", { "upper-back": 1, lats: 0.6, ...PULL }, bw),
  x("Barbell Shrug", "barbell", "shrug", { traps: 1, forearms: 0.4 }),
  x("Dumbbell Shrug", "dumbbell", "shrug", { traps: 1, forearms: 0.4 }),
  x("Back Extension", "machine", "hinge", { "lower-back": 1, glutes: 0.6, hamstrings: 0.5 }),

  // Shoulders
  x("Overhead Press", "barbell", "vertical push", {
    "front-delts": 1,
    "side-delts": 0.5,
    triceps: 0.6,
    "upper-chest": 0.2,
    abs: 0.2,
  }),
  x("Seated Dumbbell Shoulder Press", "dumbbell", "vertical push", {
    "front-delts": 1,
    "side-delts": 0.5,
    triceps: 0.6,
  }),
  x("Arnold Press", "dumbbell", "vertical push", {
    "front-delts": 1,
    "side-delts": 0.6,
    triceps: 0.5,
  }),
  x("Machine Shoulder Press", "machine", "vertical push", {
    "front-delts": 1,
    "side-delts": 0.5,
    triceps: 0.5,
  }),
  x("Smith Machine Shoulder Press", "smith-machine", "vertical push", {
    "front-delts": 1,
    "side-delts": 0.5,
    triceps: 0.6,
  }),
  x(
    "Landmine Press",
    "barbell",
    "incline push",
    { "front-delts": 1, "upper-chest": 0.5, triceps: 0.5 },
    uni,
  ),
  x("Dumbbell Lateral Raise", "dumbbell", "lateral raise", { "side-delts": 1, traps: 0.2 }),
  x("Cable Lateral Raise", "cable", "lateral raise", { "side-delts": 1, traps: 0.2 }, uni),
  x("Machine Lateral Raise", "machine", "lateral raise", { "side-delts": 1 }),
  x("Lean-Away Lateral Raise", "dumbbell", "lateral raise", { "side-delts": 1 }, uni),
  x("Dumbbell Front Raise", "dumbbell", "front raise", { "front-delts": 1, "upper-chest": 0.2 }),
  x("Cable Front Raise", "cable", "front raise", { "front-delts": 1 }),
  x("Rear Delt Fly", "dumbbell", "rear fly", { "rear-delts": 1, "upper-back": 0.5 }),
  x("Reverse Pec Deck", "machine", "rear fly", { "rear-delts": 1, "upper-back": 0.5 }),
  x("Cable Rear Delt Fly", "cable", "rear fly", { "rear-delts": 1, "upper-back": 0.4 }),
  x("Face Pull", "cable", "horizontal pull", { "rear-delts": 1, "upper-back": 0.6, traps: 0.3 }),
  x("Upright Row", "barbell", "vertical pull", { "side-delts": 1, traps: 0.7, biceps: 0.3 }),
  x("Cable Upright Row", "cable", "vertical pull", { "side-delts": 1, traps: 0.7, biceps: 0.3 }),
  x("Band Pull-Apart", "resistance-band", "rear fly", { "rear-delts": 1, "upper-back": 0.6 }, bw),
  x(
    "Pike Push-Up",
    "bodyweight",
    "vertical push",
    { "front-delts": 1, triceps: 0.6, "upper-chest": 0.3 },
    bw,
  ),

  // Biceps
  x("Barbell Curl", "barbell", "elbow flexion", { biceps: 1, forearms: 0.4 }),
  x("EZ Bar Curl", "ez-bar", "elbow flexion", { biceps: 1, forearms: 0.4 }),
  x("Dumbbell Curl", "dumbbell", "elbow flexion", { biceps: 1, forearms: 0.4 }),
  x("Incline Dumbbell Curl", "dumbbell", "elbow flexion", { biceps: 1, forearms: 0.3 }),
  x("Hammer Curl", "dumbbell", "elbow flexion", { biceps: 0.8, forearms: 1 }),
  x("Cross-Body Hammer Curl", "dumbbell", "elbow flexion", { biceps: 0.8, forearms: 1 }, uni),
  x("Preacher Curl", "ez-bar", "elbow flexion", { biceps: 1, forearms: 0.3 }),
  x("Machine Preacher Curl", "machine", "elbow flexion", { biceps: 1 }),
  x("Concentration Curl", "dumbbell", "elbow flexion", { biceps: 1 }, uni),
  x("Cable Curl", "cable", "elbow flexion", { biceps: 1, forearms: 0.3 }),
  x("Bayesian Cable Curl", "cable", "elbow flexion", { biceps: 1 }, uni),
  x("Spider Curl", "dumbbell", "elbow flexion", { biceps: 1 }),
  x("Reverse Curl", "ez-bar", "elbow flexion", { forearms: 1, biceps: 0.6 }),

  // Triceps
  x("Triceps Pushdown", "cable", "elbow extension", { triceps: 1 }),
  x("Rope Pushdown", "cable", "elbow extension", { triceps: 1 }),
  x("Single-Arm Cable Pushdown", "cable", "elbow extension", { triceps: 1 }, uni),
  x("Overhead Cable Triceps Extension", "cable", "elbow extension", { triceps: 1 }),
  x("Overhead Dumbbell Triceps Extension", "dumbbell", "elbow extension", { triceps: 1 }),
  x("Skull Crusher", "ez-bar", "elbow extension", { triceps: 1 }),
  x("Dumbbell Skull Crusher", "dumbbell", "elbow extension", { triceps: 1 }),
  x("JM Press", "barbell", "elbow extension", { triceps: 1, chest: 0.3 }),
  x("Dumbbell Kickback", "dumbbell", "elbow extension", { triceps: 1 }, uni),
  x("Bench Dip", "bodyweight", "vertical push", { triceps: 1, "front-delts": 0.4, chest: 0.3 }, bw),
  x(
    "Triceps Dip",
    "dip-station",
    "vertical push",
    { triceps: 1, chest: 0.5, "front-delts": 0.4 },
    bw,
  ),
  x("Machine Triceps Extension", "machine", "elbow extension", { triceps: 1 }),

  // Forearms
  x("Wrist Curl", "dumbbell", "wrist flexion", { forearms: 1 }),
  x("Reverse Wrist Curl", "dumbbell", "wrist extension", { forearms: 1 }),
  x(
    "Farmer's Carry",
    "dumbbell",
    "carry",
    { forearms: 1, traps: 0.7, abs: 0.4, obliques: 0.4 },
    { category: "functional" },
  ),
  x("Dead Hang", "pull-up-bar", "hang", { forearms: 1, lats: 0.3 }, timed),

  // Quads
  x("Barbell Back Squat", "barbell", "squat", {
    quads: 1,
    glutes: 0.8,
    adductors: 0.6,
    hamstrings: 0.3,
    "lower-back": 0.4,
  }),
  x("Front Squat", "barbell", "squat", {
    quads: 1,
    glutes: 0.6,
    adductors: 0.5,
    "upper-back": 0.4,
    abs: 0.3,
  }),
  x("High-Bar Squat", "barbell", "squat", {
    quads: 1,
    glutes: 0.7,
    adductors: 0.6,
    "lower-back": 0.3,
  }),
  x("Low-Bar Squat", "barbell", "squat", {
    quads: 0.8,
    glutes: 1,
    adductors: 0.6,
    hamstrings: 0.4,
    "lower-back": 0.5,
  }),
  x("Goblet Squat", "dumbbell", "squat", { quads: 1, glutes: 0.6, adductors: 0.5, abs: 0.2 }),
  x("Hack Squat", "machine", "squat", { quads: 1, glutes: 0.6, adductors: 0.4 }),
  x("Smith Machine Squat", "smith-machine", "squat", { quads: 1, glutes: 0.7, adductors: 0.5 }),
  x("Leg Press", "machine", "squat", { quads: 1, glutes: 0.6, adductors: 0.5 }),
  x("Single-Leg Leg Press", "machine", "squat", { quads: 1, glutes: 0.6, adductors: 0.4 }, uni),
  x("Pendulum Squat", "machine", "squat", { quads: 1, glutes: 0.6, adductors: 0.4 }),
  x("Belt Squat", "machine", "squat", { quads: 1, glutes: 0.7, adductors: 0.5 }),
  x("Leg Extension", "machine", "knee extension", { quads: 1 }),
  x("Single-Leg Extension", "machine", "knee extension", { quads: 1 }, uni),
  x(
    "Bulgarian Split Squat",
    "dumbbell",
    "lunge",
    { quads: 1, glutes: 0.9, adductors: 0.5, hamstrings: 0.2 },
    uni,
  ),
  x(
    "Walking Lunge",
    "dumbbell",
    "lunge",
    { quads: 1, glutes: 0.8, adductors: 0.5, hamstrings: 0.3 },
    uni,
  ),
  x(
    "Reverse Lunge",
    "dumbbell",
    "lunge",
    { glutes: 1, quads: 0.9, adductors: 0.5, hamstrings: 0.3 },
    uni,
  ),
  x("Barbell Lunge", "barbell", "lunge", { quads: 1, glutes: 0.8, adductors: 0.5 }, uni),
  x("Step-Up", "dumbbell", "lunge", { quads: 1, glutes: 0.8 }, uni),
  x("Sissy Squat", "bodyweight", "knee extension", { quads: 1 }, bw),
  x("Bodyweight Squat", "bodyweight", "squat", { quads: 1, glutes: 0.6 }, bw),
  x("Wall Sit", "bodyweight", "squat hold", { quads: 1, glutes: 0.3 }, timed),

  // Hamstrings and glutes
  x("Romanian Deadlift", "barbell", "hinge", {
    hamstrings: 1,
    glutes: 0.8,
    "lower-back": 0.6,
    forearms: 0.4,
  }),
  x("Dumbbell Romanian Deadlift", "dumbbell", "hinge", {
    hamstrings: 1,
    glutes: 0.8,
    "lower-back": 0.5,
    forearms: 0.4,
  }),
  x(
    "Single-Leg Romanian Deadlift",
    "dumbbell",
    "hinge",
    { hamstrings: 1, glutes: 0.9, "lower-back": 0.3 },
    uni,
  ),
  x("Stiff-Leg Deadlift", "barbell", "hinge", { hamstrings: 1, glutes: 0.7, "lower-back": 0.7 }),
  x("Good Morning", "barbell", "hinge", { hamstrings: 1, "lower-back": 0.8, glutes: 0.6 }),
  x("Lying Leg Curl", "machine", "knee flexion", { hamstrings: 1, calves: 0.2 }),
  x("Seated Leg Curl", "machine", "knee flexion", { hamstrings: 1 }),
  x("Single-Leg Curl", "machine", "knee flexion", { hamstrings: 1 }, uni),
  x("Nordic Hamstring Curl", "bodyweight", "knee flexion", { hamstrings: 1 }, bw),
  x("Barbell Hip Thrust", "barbell", "hip extension", { glutes: 1, hamstrings: 0.4, quads: 0.3 }),
  x("Machine Hip Thrust", "machine", "hip extension", { glutes: 1, hamstrings: 0.4 }),
  x("Glute Bridge", "bodyweight", "hip extension", { glutes: 1, hamstrings: 0.4 }, bw),
  x("Cable Pull-Through", "cable", "hinge", { glutes: 1, hamstrings: 0.7 }),
  x("Cable Glute Kickback", "cable", "hip extension", { glutes: 1, hamstrings: 0.3 }, uni),
  x(
    "Kettlebell Swing",
    "kettlebell",
    "hinge",
    { glutes: 1, hamstrings: 0.8, "lower-back": 0.4, abs: 0.2 },
    { category: "functional" },
  ),
  x("Hip Abduction Machine", "machine", "hip abduction", { abductors: 1, glutes: 0.6 }),
  x("Cable Hip Abduction", "cable", "hip abduction", { abductors: 1, glutes: 0.6 }, uni),
  x("Hip Adduction Machine", "machine", "hip adduction", { adductors: 1 }),
  x("Copenhagen Plank", "bodyweight", "hip adduction", { adductors: 1, obliques: 0.5 }, timed),

  // Calves
  x("Standing Calf Raise", "machine", "plantar flexion", { calves: 1 }),
  x("Seated Calf Raise", "machine", "plantar flexion", { calves: 1 }),
  x("Leg Press Calf Raise", "machine", "plantar flexion", { calves: 1 }),
  x("Smith Machine Calf Raise", "smith-machine", "plantar flexion", { calves: 1 }),
  x("Single-Leg Calf Raise", "dumbbell", "plantar flexion", { calves: 1 }, uni),

  // Core
  x("Plank", "bodyweight", "anti-extension", { abs: 1, obliques: 0.5 }, timed),
  x(
    "Side Plank",
    "bodyweight",
    "anti-lateral flexion",
    { obliques: 1, abs: 0.4 },
    { ...timed, unilateral: true },
  ),
  x("Crunch", "bodyweight", "spinal flexion", { abs: 1 }, bw),
  x("Cable Crunch", "cable", "spinal flexion", { abs: 1, obliques: 0.3 }),
  x("Machine Crunch", "machine", "spinal flexion", { abs: 1 }),
  x(
    "Hanging Leg Raise",
    "pull-up-bar",
    "hip flexion",
    { abs: 1, obliques: 0.4, forearms: 0.3 },
    bw,
  ),
  x("Hanging Knee Raise", "pull-up-bar", "hip flexion", { abs: 1, forearms: 0.3 }, bw),
  x("Captain's Chair Leg Raise", "dip-station", "hip flexion", { abs: 1, obliques: 0.3 }, bw),
  x("Lying Leg Raise", "bodyweight", "hip flexion", { abs: 1 }, bw),
  x("Ab Wheel Rollout", "none", "anti-extension", { abs: 1, lats: 0.3, obliques: 0.4 }, bw),
  x("Dead Bug", "bodyweight", "anti-extension", { abs: 1, obliques: 0.3 }, bw),
  x("Russian Twist", "bodyweight", "rotation", { obliques: 1, abs: 0.5 }, bw),
  x("Cable Woodchopper", "cable", "rotation", { obliques: 1, abs: 0.5 }, uni),
  x("Pallof Press", "cable", "anti-rotation", { obliques: 1, abs: 0.6 }, uni),
  x("Decline Sit-Up", "bodyweight", "spinal flexion", { abs: 1, obliques: 0.3 }, bw),

  // Full body and plyometrics
  x(
    "Power Clean",
    "barbell",
    "olympic",
    { quads: 0.6, glutes: 0.8, hamstrings: 0.6, traps: 1, "upper-back": 0.5, "lower-back": 0.5 },
    { category: "plyometrics" },
  ),
  x(
    "Thruster",
    "dumbbell",
    "squat to press",
    { quads: 1, glutes: 0.6, "front-delts": 0.8, triceps: 0.5 },
    { category: "functional" },
  ),
  x(
    "Burpee",
    "bodyweight",
    "full body",
    { quads: 0.8, chest: 0.6, "front-delts": 0.4, abs: 0.4 },
    { category: "plyometrics", measurement: "reps" },
  ),
  x(
    "Box Jump",
    "none",
    "jump",
    { quads: 1, glutes: 0.7, calves: 0.6 },
    { category: "plyometrics", measurement: "reps" },
  ),
  x(
    "Jump Squat",
    "bodyweight",
    "jump",
    { quads: 1, glutes: 0.7, calves: 0.6 },
    { category: "plyometrics", measurement: "reps" },
  ),
  x(
    "Sled Push",
    "machine",
    "carry",
    { quads: 1, glutes: 0.8, calves: 0.5 },
    { category: "functional", measurement: "distance_time" },
  ),
  x(
    "Battle Ropes",
    "none",
    "conditioning",
    { "front-delts": 0.8, abs: 0.4, forearms: 0.5 },
    { category: "functional", measurement: "time" },
  ),
  x(
    "Jump Rope",
    "none",
    "conditioning",
    { calves: 1 },
    { category: "cardio", measurement: "time" },
  ),

  // Cardio
  x("Running", "none", "cardio", { quads: 0.6, hamstrings: 0.5, calves: 0.6, glutes: 0.5 }, cardio),
  x(
    "Treadmill Run",
    "cardio-machine",
    "cardio",
    { quads: 0.6, hamstrings: 0.5, calves: 0.6, glutes: 0.5 },
    cardio,
  ),
  x(
    "Incline Treadmill Walk",
    "cardio-machine",
    "cardio",
    { glutes: 0.6, calves: 0.6, hamstrings: 0.4 },
    cardio,
  ),
  x("Walking", "none", "cardio", { calves: 0.4, quads: 0.3 }, cardio),
  x("Cycling", "none", "cardio", { quads: 0.8, glutes: 0.4, calves: 0.3 }, cardio),
  x(
    "Stationary Bike",
    "cardio-machine",
    "cardio",
    { quads: 0.8, glutes: 0.4, calves: 0.3 },
    cardio,
  ),
  x(
    "Rowing Machine",
    "cardio-machine",
    "cardio",
    { lats: 0.6, quads: 0.6, "upper-back": 0.5, glutes: 0.4, biceps: 0.3 },
    cardio,
  ),
  x("Elliptical", "cardio-machine", "cardio", { quads: 0.5, glutes: 0.4 }, cardio),
  x("Stair Climber", "cardio-machine", "cardio", { quads: 0.7, glutes: 0.7, calves: 0.5 }, cardio),
  x("Swimming", "none", "cardio", { lats: 0.6, "front-delts": 0.4, triceps: 0.3 }, cardio),
  x(
    "Assault Bike",
    "cardio-machine",
    "cardio",
    { quads: 0.7, "front-delts": 0.3, glutes: 0.4 },
    cardio,
  ),
  x("SkiErg", "cardio-machine", "cardio", { lats: 0.7, triceps: 0.4, abs: 0.4 }, cardio),

  // Mobility and stretching
  x(
    "Hip Flexor Stretch",
    "none",
    "stretch",
    { quads: 0.5 },
    { category: "stretching", measurement: "time", unilateral: true },
  ),
  x(
    "Hamstring Stretch",
    "none",
    "stretch",
    { hamstrings: 0.5 },
    { category: "stretching", measurement: "time" },
  ),
  x(
    "Doorway Chest Stretch",
    "none",
    "stretch",
    { chest: 0.5 },
    { category: "stretching", measurement: "time" },
  ),
  x(
    "World's Greatest Stretch",
    "none",
    "mobility",
    { glutes: 0.3, quads: 0.3 },
    { category: "mobility", measurement: "reps" },
  ),
  x(
    "Cat-Cow",
    "none",
    "mobility",
    { "lower-back": 0.3 },
    { category: "mobility", measurement: "reps" },
  ),
  x(
    "Thoracic Rotation",
    "none",
    "mobility",
    { "upper-back": 0.3 },
    { category: "mobility", measurement: "reps" },
  ),
  x(
    "Shoulder Dislocate",
    "resistance-band",
    "mobility",
    { "front-delts": 0.3, "rear-delts": 0.3 },
    { category: "mobility", measurement: "reps" },
  ),
  x(
    "Deep Squat Hold",
    "none",
    "mobility",
    { adductors: 0.4, quads: 0.3 },
    { category: "mobility", measurement: "time" },
  ),
];
