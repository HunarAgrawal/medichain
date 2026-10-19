export const ACCEPTED_SCAN_TYPES = ["image/png", "image/jpeg"];

/** Client-side check mirroring the API's limits, for an immediate, friendly message. */
export function validateScan(file: File, maxUploadMb: number): string | undefined {
  if (!ACCEPTED_SCAN_TYPES.includes(file.type)) return "Choose a PNG or JPEG image.";
  if (file.size > maxUploadMb * 1024 * 1024) return `The file is larger than ${maxUploadMb} MB.`;
  return undefined;
}
