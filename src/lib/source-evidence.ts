import { sourceNumbers } from "./numbers";

export function sourcePassages(source: string) {
  return [...source.matchAll(/.+?(?:[.!?](?=\s|$)|\n|$)/g)].flatMap((match) => {
    const text = match[0].trim();
    if (!text) return [];
    const start = match.index + match[0].indexOf(text);
    return [{ start, end: start + text.length, text }];
  });
}
export function suggestPassages(source: string, value: string) {
  const numbers = sourceNumbers(value);
  const words = value
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  return sourcePassages(source)
    .map((passage) => ({
      ...passage,
      score:
        (value.trim() && passage.text.includes(value.trim()) ? 10 : 0) +
        numbers.filter((n) =>
          sourceNumbers(passage.text).some(
            (p) => p.value === n.value && (!n.unit || p.unit === n.unit),
          ),
        ).length *
          3 +
        words.filter((w) => passage.text.toLocaleLowerCase().includes(w))
          .length,
    }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
