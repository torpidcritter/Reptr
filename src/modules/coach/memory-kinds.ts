export const memoryKinds = ["injury", "preference", "equipment", "schedule", "other"] as const;

export const memoryKindLabels: Record<(typeof memoryKinds)[number], string> = {
  injury: "Injury or limitation",
  preference: "Preference",
  equipment: "Equipment",
  schedule: "Schedule",
  other: "Other",
};
