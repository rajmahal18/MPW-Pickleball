export const DEFAULT_RECOGNITION_DIVISION_SLUG = "team-event";

export function recognitionDivisionSlug(value = process.env.RECOGNITION_DIVISION_SLUG) {
  return value?.trim() || DEFAULT_RECOGNITION_DIVISION_SLUG;
}

export function isRecognitionDivision(
  division: { slug: string },
  configuredSlug = recognitionDivisionSlug(),
) {
  return division.slug === configuredSlug;
}
