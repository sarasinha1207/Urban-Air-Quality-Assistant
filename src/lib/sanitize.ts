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

/**
 * Cleans model output that will be shown as plain text: removes control and invisible formatting
 * characters (which can hide or reorder text) while keeping line breaks and tabs.
 * @param value - Untrusted text, such as a Gemini reply.
 * @returns The text without control or format characters.
 */
export function cleanModelText(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, (char) => (char === "\n" || char === "\t" ? char : ""));
}
