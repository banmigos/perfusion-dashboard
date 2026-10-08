type TaskLike = {
  title: string;
  category?: string | null;
  derivedFromRequirementId?: number | null;
};

/**
 * Display title for a checklist task. Tasks generated from a requirement carry
 * the requirement's data-model label; present those as the action they imply.
 * Tasks the user wrote themselves are shown verbatim, as is anything unmapped.
 * Display only: the stored title is never changed.
 */
export function taskTitle(task: TaskLike): string {
  if (task.derivedFromRequirementId == null) {
    return task.title;
  }
  if (/^tuition\b/i.test(task.title)) {
    return "Research tuition details";
  }
  switch (task.category) {
    case "gpa":
      return "Confirm GPA requirement";
    case "test":
      return /\bgre\b/i.test(task.title)
        ? "Confirm whether the GRE is required"
        : task.title;
    case "shadowing":
      return "Plan shadowing hours";
    default:
      return task.title;
  }
}
