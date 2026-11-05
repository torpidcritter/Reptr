import type postgres from "postgres";
import { exercises } from "./exercises";
import { difficultyFor, guidanceFor } from "./guidance";
import { equipmentList, muscles } from "./muscles";

const PRIMARY_THRESHOLD = 0.75;

/**
 * Loads the built-in muscle groups, equipment and exercise library.
 * Safe to run repeatedly: rows are matched by slug and updated in place.
 * Built-in exercises removed from the list are archived, not deleted, so history stays intact.
 */
export async function seed(sql: postgres.Sql) {
  return sql.begin(async (tx) => {
    for (const [i, m] of muscles.entries()) {
      await tx`
        insert into muscle_groups (slug, name, region, sort_order)
        values (${m.slug}, ${m.name}, ${m.region}, ${i})
        on conflict (slug) do update
        set name = excluded.name, region = excluded.region, sort_order = excluded.sort_order`;
    }

    for (const q of equipmentList) {
      await tx`
        insert into equipment (slug, name) values (${q.slug}, ${q.name})
        on conflict (slug) do update set name = excluded.name`;
    }

    const muscleIds = new Map(
      (await tx`select id, slug from muscle_groups`).map((r) => [r.slug as string, r.id as string]),
    );
    const equipmentIds = new Map(
      (await tx`select id, slug from equipment`).map((r) => [r.slug as string, r.id as string]),
    );

    for (const e of exercises) {
      const g = guidanceFor(e);
      const [row] = await tx`
        insert into exercises (slug, name, category, measurement, equipment_id, movement_pattern,
                               is_unilateral, is_archived, form_cues, common_mistakes, safety_notes, difficulty)
        values (${e.slug}, ${e.name}, ${e.category}, ${e.measurement}, ${equipmentIds.get(e.equipment)!},
                ${e.pattern}, ${e.unilateral}, false, ${g.cues.join("\n")}, ${g.mistakes.join("\n")},
                ${g.safety.join("\n")}, ${difficultyFor(e)})
        on conflict (slug) where owner_id is null do update
        set name = excluded.name, category = excluded.category, measurement = excluded.measurement,
            equipment_id = excluded.equipment_id, movement_pattern = excluded.movement_pattern,
            is_unilateral = excluded.is_unilateral, is_archived = false,
            form_cues = excluded.form_cues, common_mistakes = excluded.common_mistakes,
            safety_notes = excluded.safety_notes, difficulty = excluded.difficulty, updated_at = now()
        returning id`;

      await tx`delete from exercise_muscles where exercise_id = ${row.id}`;
      for (const [slug, contribution] of Object.entries(e.muscles)) {
        await tx`
          insert into exercise_muscles (exercise_id, muscle_id, role, contribution)
          values (${row.id}, ${muscleIds.get(slug)!},
                  ${contribution >= PRIMARY_THRESHOLD ? "primary" : "secondary"}, ${contribution})`;
      }
    }

    const slugs = exercises.map((e) => e.slug);
    await tx`
      update exercises set is_archived = true, updated_at = now()
      where owner_id is null and not (slug = any(${slugs}))`;

    return {
      muscles: muscles.length,
      equipment: equipmentList.length,
      exercises: exercises.length,
    };
  });
}
