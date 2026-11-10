// Shared by server and client code, so no database imports here.

export const metricTypes = [
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
] as const;
export type MetricType = (typeof metricTypes)[number];

export const metricLabels: Record<MetricType, string> = {
  weight: "Weight",
  body_fat: "Body fat",
  chest: "Chest",
  waist: "Waist",
  hips: "Hips",
  neck: "Neck",
  shoulders: "Shoulders",
  arm_left: "Arm (left)",
  arm_right: "Arm (right)",
  forearm_left: "Forearm (left)",
  forearm_right: "Forearm (right)",
  thigh_left: "Thigh (left)",
  thigh_right: "Thigh (right)",
  calf_left: "Calf (left)",
  calf_right: "Calf (right)",
};

/** Tape measurements, i.e. everything stored in cm. */
export const tapeTypes = metricTypes.filter((t) => t !== "weight" && t !== "body_fat");

/** Most progress photos one person can keep. Matches photo_quota_left() in migration 0024. */
export const PHOTO_LIMIT = 300;
export const photoLimitMessage = `You have ${PHOTO_LIMIT} progress photos, the most Reptr keeps. Delete some to add more.`;

/** Private Supabase Storage bucket for progress photos, one folder per user. */
export const photoBucket = "progress-photos";
