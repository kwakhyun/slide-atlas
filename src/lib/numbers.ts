export interface SourceNumber {
  raw: string;
  value: string;
  unit: string;
  start: number;
  end: number;
}

/** Keep offsets in the original source. Longer units must precede their prefixes. */
export function sourceNumbers(source: string): SourceNumber[] {
  const pattern =
    /([+\-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?:[ \t]*(%p|%|조원|억원|만원|천원|조|억|만|천|배|개|명|원|년|월|일))?/g;
  const normalized = source.replace(/[０-９＋－．％，]/g, (character) =>
    character.normalize("NFKC"),
  );
  return [...normalized.matchAll(pattern)].map((match) => {
    const numeric = match[1].replace(/,/g, "").replace("−", "-");
    const negative = numeric.startsWith("-");
    const [integer, fraction = ""] = numeric.replace(/^[+-]/, "").split(".");
    const decimal = fraction.replace(/0+$/, "");
    const magnitude = `${integer.replace(/^0+(?=\d)/, "")}${decimal ? `.${decimal}` : ""}`;
    return {
      raw: source.slice(match.index, match.index + match[0].length),
      value: `${negative && magnitude !== "0" ? "-" : ""}${magnitude}`,
      unit: match[2] ?? "",
      start: match.index,
      end: match.index + match[0].length,
    };
  });
}

export function unsupportedNumbers(output: string, source: string): string[] {
  const original = sourceNumbers(source);
  return [
    ...new Set(
      sourceNumbers(output)
        .filter(
          (number) =>
            !original.some(
              (candidate) =>
                candidate.value === number.value &&
                // A value-only slot may place the unit in a separate caption. An explicit
                // unit must match; equal magnitudes do not justify changing %, people, etc.
                (!number.unit || candidate.unit === number.unit),
            ),
        )
        .map((number) => number.raw),
    ),
  ];
}
