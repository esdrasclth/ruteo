// Builds the external tracking URL for a carrier from its template. The template
// uses a `{tracking}` placeholder, e.g. "https://www.dhl.com/track?id={tracking}".
export function buildTrackingUrl(
  template: string | null | undefined,
  externalTracking: string | null | undefined,
): string | null {
  if (!template || !externalTracking) {
    return null;
  }
  return template.replace('{tracking}', encodeURIComponent(externalTracking));
}
