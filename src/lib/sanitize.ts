/**
 * Strips control characters, markup and quoting characters from text that comes from outside
 * (for example a geocoder place name) before it is placed in a prompt, then bounds its length.
 * @param value - Untrusted text.
 * @param maxLength - Maximum length of the returned string.
 * @returns A single-line, length-bounded string with no characters that could break out of data.
 */
export function sanitizeText(value: string, maxLength: number): string {
  return value
    .replace(/[\p{C}<>{}[\]`\\"]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
