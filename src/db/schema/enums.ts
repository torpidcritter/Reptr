import { pgEnum } from "drizzle-orm/pg-core";

export const unitSystem = pgEnum("unit_system", ["metric", "imperial"]);
export const themePreference = pgEnum("theme_preference", ["light", "dark", "system"]);
export const experienceLevel = pgEnum("experience_level", ["beginner", "intermediate", "advanced"]);
export const trainingGoal = pgEnum("training_goal", [
  "all_round",
  "hypertrophy",
  "strength",
  "recomposition",
  "conditioning",
  "maintenance",
]);

export const bodyRegion = pgEnum("body_region", ["upper", "lower", "core", "full_body"]);

export const exerciseCategory = pgEnum("exercise_category", [
  "resistance",
  "bodyweight",
  "cardio",
  "mobility",
  "stretching",
  "plyometrics",
  "functional",
]);

/** How a set of this exercise is measured, which decides the inputs shown and the maths used. */
export const measurementType = pgEnum("measurement_type", [
  "weight_reps",
  "reps",
  "assisted_reps",
  "time",
  "distance_time",
]);

export const muscleRole = pgEnum("muscle_role", ["primary", "secondary"]);

export const workoutStatus = pgEnum("workout_status", [
  "active",
  "paused",
  "completed",
  "abandoned",
]);

export const setType = pgEnum("set_type", ["warmup", "working", "drop", "failure", "rest_pause"]);

export const recordType = pgEnum("record_type", [
  "heaviest_weight",
  "best_e1rm",
  "most_reps",
  "best_set_volume",
  "longest_duration",
  "longest_distance",
]);

export const bodyMetricType = pgEnum("body_metric_type", [
  "weight",
  "body_fat",
  "chest",
  "waist",
  "hips",
  "neck",
  "shoulders",
  "arm_left",
  "arm_right",
  "forearm_left",
  "forearm_right",
  "thigh_left",
  "thigh_right",
  "calf_left",
  "calf_right",
]);

export const photoPose = pgEnum("photo_pose", ["front", "side", "back"]);

export const difficulty = pgEnum("difficulty", ["beginner", "intermediate", "advanced"]);

export const goalKind = pgEnum("goal_kind", ["strength", "bodyweight", "consistency"]);
