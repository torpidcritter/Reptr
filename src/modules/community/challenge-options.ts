// Choices for challenges, shared by the server module and the form.

export const metrics = {
  workouts: { label: "Workouts", unit: "workouts" },
  volume: { label: "Volume", unit: "kg" },
  sets: { label: "Working sets", unit: "sets" },
  minutes: { label: "Training time", unit: "minutes" },
} as const;
export type Metric = keyof typeof metrics;

export const challengeKinds = {
  only_me: "Just me",
  followers: "Friends (people who follow me)",
  group: "A group",
  public: "Anyone",
} as const;
export type ChallengeVisibility = keyof typeof challengeKinds;
