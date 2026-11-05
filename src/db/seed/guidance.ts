import type { SeedExercise } from "./exercises";

// Coaching notes for the built-in library, written per movement pattern so every
// exercise gets sensible guidance. General technique advice, not medical advice.

export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface Guidance {
  cues: string[];
  mistakes: string[];
  safety: string[];
}

const LOWER_BACK =
  "Stop if you feel sharp or radiating pain in your back, and keep the spine neutral under load.";
const SHOULDER =
  "Stop if you feel pinching or sharp pain in the front of the shoulder; reduce the range or the load.";
const KNEE = "Stop if you feel sharp knee pain; keep the knee tracking in line with your toes.";
const ELBOW = "Use a load you can control without elbow pain; tendon irritation builds up slowly.";
const SPOTTER = "Use safety pins, a spotter or a weight you can always re-rack under control.";

const byPattern: Record<string, Guidance> = {
  "horizontal push": {
    cues: [
      "Shoulder blades pulled back and down, feet planted.",
      "Lower under control to the lower chest, elbows about 45° from your body.",
      "Press up and slightly back, keeping the wrists stacked over the elbows.",
    ],
    mistakes: [
      "Flaring the elbows straight out to the sides.",
      "Bouncing the weight off the chest.",
      "Lifting the hips or losing the upper-back arch mid-set.",
    ],
    safety: [SHOULDER, SPOTTER],
  },
  "incline push": {
    cues: [
      "Set the bench to about 30°, shoulder blades pinned back.",
      "Lower to the upper chest with forearms vertical.",
      "Press up over the shoulders without shrugging.",
    ],
    mistakes: [
      "Bench set too steep, turning it into a shoulder press.",
      "Letting the shoulders roll forward at the top.",
    ],
    safety: [SHOULDER, SPOTTER],
  },
  "vertical push": {
    cues: [
      "Brace your abs and squeeze your glutes so the ribs stay down.",
      "Press in a straight line, moving the head back and then through at the top.",
      "Finish with the arms locked out over the middle of the foot.",
    ],
    mistakes: [
      "Leaning back and turning it into an incline press.",
      "Pressing the bar out in front instead of overhead.",
    ],
    safety: [SHOULDER, LOWER_BACK],
  },
  "chest fly": {
    cues: [
      "Keep a soft, fixed bend in the elbows throughout.",
      "Open the arms until you feel a stretch across the chest, not the shoulder.",
      "Bring the hands together by squeezing the chest.",
    ],
    mistakes: ["Bending and straightening the elbows, turning it into a press.", "Going too deep."],
    safety: [SHOULDER],
  },
  "horizontal pull": {
    cues: [
      "Brace your trunk and keep the chest up.",
      "Start each rep by pulling the shoulder blades back, then drive the elbows behind you.",
      "Pause briefly with the shoulder blades squeezed, then lower under control.",
    ],
    mistakes: [
      "Using body swing to move the weight.",
      "Shrugging the shoulders toward the ears.",
      "Cutting the stretch short at the bottom.",
    ],
    safety: [LOWER_BACK],
  },
  "vertical pull": {
    cues: [
      "Start from a full hang or full stretch with the shoulders engaged.",
      "Drive the elbows down toward your back pockets.",
      "Bring the chest toward the bar and lower all the way under control.",
    ],
    mistakes: [
      "Half reps that never reach a full stretch.",
      "Kipping or swinging unless that is the goal.",
      "Pulling with the arms only and rounding the shoulders forward.",
    ],
    safety: [SHOULDER, ELBOW],
  },
  squat: {
    cues: [
      "Feet about shoulder-width apart, brace your abs before each rep.",
      "Sit down between your hips with the knees tracking over the toes.",
      "Go as deep as you can with a neutral spine, then drive up through the whole foot.",
    ],
    mistakes: [
      "Knees caving in on the way up.",
      "Heels lifting or weight shifting onto the toes.",
      "Losing the brace and rounding the lower back at the bottom.",
    ],
    safety: [KNEE, LOWER_BACK, SPOTTER],
  },
  "squat hold": {
    cues: ["Sit into the position with the chest up and knees over the toes.", "Breathe steadily."],
    mistakes: ["Letting the knees collapse inward.", "Holding your breath."],
    safety: [KNEE],
  },
  lunge: {
    cues: [
      "Take a long enough step that the front shin stays fairly upright.",
      "Lower the back knee straight down toward the floor.",
      "Push through the front heel to return.",
    ],
    mistakes: ["Front knee caving inward.", "Steps too short, putting stress on the knee."],
    safety: [KNEE],
  },
  hinge: {
    cues: [
      "Push the hips back with soft knees and a long, neutral spine.",
      "Keep the weight close to your legs throughout.",
      "Stand up by driving the hips forward and squeezing the glutes, without leaning back.",
    ],
    mistakes: [
      "Rounding the lower back.",
      "Turning it into a squat by bending the knees too much.",
      "Hyperextending the back at lockout.",
    ],
    safety: [LOWER_BACK],
  },
  "hip extension": {
    cues: [
      "Keep the ribs down and chin tucked.",
      "Drive through the heels and squeeze the glutes hard at the top.",
      "Lower under control.",
    ],
    mistakes: ["Arching the lower back to get higher.", "Pushing through the toes."],
    safety: [LOWER_BACK],
  },
  "knee extension": {
    cues: [
      "Line the knee up with the machine's pivot.",
      "Extend fully and pause, then lower slowly.",
    ],
    mistakes: ["Swinging the weight up.", "Letting the weight stack crash down."],
    safety: [KNEE],
  },
  "knee flexion": {
    cues: ["Keep the hips pressed into the pad.", "Curl fully, pause, and lower slowly."],
    mistakes: ["Lifting the hips to finish the rep.", "Cutting the range short."],
    safety: [KNEE],
  },
  "plantar flexion": {
    cues: [
      "Lower into a deep stretch at the bottom and pause.",
      "Rise as high as you can onto the big toe.",
    ],
    mistakes: ["Bouncing out of the bottom.", "Short, fast reps."],
    safety: ["Build up volume gradually; the Achilles tendon adapts slowly."],
  },
  "hip abduction": {
    cues: ["Sit tall and push the knees out with control.", "Pause at the end of the range."],
    mistakes: ["Rocking the torso to move the weight."],
    safety: ["Use a range that feels comfortable on the hips."],
  },
  "hip adduction": {
    cues: ["Squeeze the legs together with control.", "Start from a stretch you can control."],
    mistakes: ["Starting from a stretch that's too wide.", "Letting the weight snap back."],
    safety: ["Ease into the stretch to avoid groin strains."],
  },
  "hip flexion": {
    cues: [
      "Keep the lower back pressed down or neutral.",
      "Raise the legs with control, no swinging.",
    ],
    mistakes: ["Swinging the legs with momentum.", "Arching the lower back."],
    safety: [LOWER_BACK],
  },
  "elbow flexion": {
    cues: [
      "Keep the elbows pinned at your sides.",
      "Curl up without the shoulders rolling forward.",
      "Lower all the way to a straight arm under control.",
    ],
    mistakes: ["Swinging the torso.", "Elbows drifting forward.", "Skipping the bottom half."],
    safety: [ELBOW],
  },
  "elbow extension": {
    cues: [
      "Keep the upper arms still and close to your head or body.",
      "Lock out fully and squeeze the triceps.",
      "Lower slowly into a full stretch.",
    ],
    mistakes: ["Elbows flaring out.", "Moving the shoulders to help."],
    safety: [ELBOW],
  },
  "lateral raise": {
    cues: [
      "Lean slightly forward with a soft bend in the elbows.",
      "Raise out to the sides, leading with the elbows, up to about shoulder height.",
      "Lower slowly.",
    ],
    mistakes: ["Shrugging the weight up with the traps.", "Swinging, and using too much weight."],
    safety: [SHOULDER],
  },
  "front raise": {
    cues: ["Raise to about eye level with the arms nearly straight.", "Keep the torso still."],
    mistakes: ["Leaning back to swing the weight up."],
    safety: [SHOULDER],
  },
  "rear fly": {
    cues: [
      "Hinge forward or face the pad, with soft elbows.",
      "Sweep the arms out wide, squeezing the back of the shoulders.",
    ],
    mistakes: [
      "Squeezing the shoulder blades together and using the traps.",
      "Using too much weight.",
    ],
    safety: [SHOULDER],
  },
  shrug: {
    cues: [
      "Lift the shoulders straight up toward the ears.",
      "Pause at the top, then lower fully.",
    ],
    mistakes: ["Rolling the shoulders in circles.", "Bending the elbows."],
    safety: ["Keep the neck relaxed and the chin neutral."],
  },
  "shoulder extension": {
    cues: [
      "Keep the arms nearly straight and pull down in an arc to the hips.",
      "Keep the trunk still.",
    ],
    mistakes: ["Bending the elbows into a pulldown.", "Rocking the torso."],
    safety: [SHOULDER],
  },
  "spinal flexion": {
    cues: ["Curl the ribs toward the pelvis.", "Breathe out as you crunch, and move slowly."],
    mistakes: ["Pulling on the neck.", "Using the hip flexors to swing up."],
    safety: ["Keep the neck relaxed; stop if you feel back pain."],
  },
  "anti-extension": {
    cues: [
      "Squeeze the glutes and tuck the pelvis slightly.",
      "Keep the ribs down and a straight line from head to heels.",
    ],
    mistakes: ["Letting the hips sag.", "Holding past the point where form breaks."],
    safety: [LOWER_BACK],
  },
  "anti-rotation": {
    cues: [
      "Brace hard and keep the hips and shoulders square.",
      "Move slowly and resist the twist.",
    ],
    mistakes: ["Letting the torso rotate toward the anchor."],
    safety: [LOWER_BACK],
  },
  rotation: {
    cues: ["Rotate through the upper back and hips together.", "Control the return."],
    mistakes: ["Twisting only through the lower back.", "Using momentum."],
    safety: [LOWER_BACK],
  },
  hang: {
    cues: ["Grip the bar fully and keep the shoulders gently engaged.", "Breathe steadily."],
    mistakes: ["Hanging completely loose on the shoulder joints for long holds."],
    safety: [SHOULDER],
  },
  "wrist flexion": {
    cues: ["Rest the forearms on a bench and move only at the wrist.", "Use a full range."],
    mistakes: ["Using too much weight and losing range."],
    safety: [ELBOW],
  },
  "wrist extension": {
    cues: ["Rest the forearms on a bench and move only at the wrist.", "Go light and slow."],
    mistakes: ["Using too much weight."],
    safety: [ELBOW],
  },
  carry: {
    cues: [
      "Stand tall with the shoulders down and the trunk braced.",
      "Take short, controlled steps.",
    ],
    mistakes: ["Leaning to one side.", "Letting the shoulders shrug up or round forward."],
    safety: [LOWER_BACK, "Put the weights down under control if your grip is about to fail."],
  },
  "anti-lateral flexion": {
    cues: ["Keep the hips stacked and the body in a straight line.", "Don't let the hips drop."],
    mistakes: ["Hips sagging toward the floor.", "Rotating the chest forward or back."],
    safety: [LOWER_BACK],
  },
  olympic: {
    cues: [
      "Start with the bar over the middle of the foot and the back flat.",
      "Push through the legs, then extend the hips explosively and pull yourself under the bar.",
      "Catch with the elbows high and the trunk braced.",
    ],
    mistakes: ["Pulling early with the arms.", "Catching with the elbows low."],
    safety: ["Learn the technique with light weight or a coach before loading it up.", LOWER_BACK],
  },
  "squat to press": {
    cues: [
      "Squat with the weight in the front rack.",
      "Use the drive out of the squat to press overhead.",
    ],
    mistakes: ["Pressing before you've stood up.", "Arching the lower back overhead."],
    safety: [KNEE, LOWER_BACK],
  },
  "full body": {
    cues: ["Keep a steady rhythm you can repeat.", "Brace the trunk on each rep."],
    mistakes: ["Letting form fall apart as you tire."],
    safety: ["Stop if you feel dizzy or get sharp pain."],
  },
  jump: {
    cues: [
      "Load the hips, then jump explosively.",
      "Land softly with the knees bent and tracking over the toes.",
    ],
    mistakes: [
      "Landing stiff-legged.",
      "Knees caving in on landing.",
      "Doing too many reps tired.",
    ],
    safety: [KNEE, "Keep total jumps per session modest and add them gradually."],
  },
  conditioning: {
    cues: ["Pick a pace you can sustain for the whole interval.", "Keep good posture as you tire."],
    mistakes: ["Starting too fast and fading.", "Form breaking down under fatigue."],
    safety: [
      "Stop if you get chest pain, dizziness or unusual shortness of breath, and get checked by a doctor.",
    ],
  },
  stretch: {
    cues: ["Ease into the stretch until you feel mild tension.", "Hold and breathe slowly."],
    mistakes: ["Bouncing.", "Forcing a stretch into pain."],
    safety: ["A stretch should feel like tension, never sharp pain."],
  },
  mobility: {
    cues: ["Move slowly through the range you have.", "Breathe and let the range grow over time."],
    mistakes: ["Rushing through the reps.", "Forcing the end range."],
    safety: ["Work within a pain-free range."],
  },
  cardio: {
    cues: [
      "Warm up for 5 minutes at an easy pace.",
      "Most sessions should be at a pace where you can still talk.",
      "Cool down gradually.",
    ],
    mistakes: [
      "Going hard every session.",
      "Increasing distance or time too quickly week to week.",
    ],
    safety: [
      "Stop if you get chest pain, dizziness or unusual shortness of breath, and get checked by a doctor.",
    ],
  },
};

const fallback: Guidance = {
  cues: ["Move under control through a full, comfortable range.", "Brace your trunk and breathe."],
  mistakes: ["Using momentum instead of muscle.", "Sacrificing range of motion for load."],
  safety: ["Stop if something hurts sharply, and use a load you can control."],
};

export function guidanceFor(e: SeedExercise): Guidance {
  return byPattern[e.pattern] ?? fallback;
}

// Lifts that take real practice to do well, regardless of their pattern.
const ADVANCED = /\b(snatch|power clean|jerk|pistol|muscle-up|dragon flag|handstand|nordic)\b/i;
const INTERMEDIATE =
  /\b(deadlift|good morning|pull-up|chin-up|dip|front squat|overhead press|bulgarian|barbell row|pendlay|hack squat|t-bar)\b/i;

/** A rough difficulty: how much skill and stability the lift needs, not how heavy it is. */
export function difficultyFor(e: SeedExercise): Difficulty {
  if (/^assisted /i.test(e.name)) return "beginner";
  if (ADVANCED.test(e.name)) return "advanced";
  if (e.category === "plyometrics") return "intermediate";
  if (INTERMEDIATE.test(e.name)) return "intermediate";
  const freeWeight = e.equipment === "barbell" || e.equipment === "kettlebell";
  if (freeWeight && ["squat", "hinge", "lunge", "vertical push"].includes(e.pattern)) {
    return "intermediate";
  }
  return "beginner";
}
