export function parseDeleteBuildIds(values?: string[]): number[] {
  if (!values || values.length === 0) {
    return [];
  }

  const splitValues = values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  if (splitValues.length === 0) {
    return [];
  }

  const parsed = splitValues.map((value) => {
    const num = Number.parseInt(value, 10);
    if (!Number.isFinite(num)) {
      throw new Error(`Invalid build id "${value}". Use numeric IDs.`);
    }
    return num;
  });

  return Array.from(new Set(parsed)).sort((a, b) => b - a);
}
