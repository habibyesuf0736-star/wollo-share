// Ranking for a typed suggestion list. Lower scores are better, so an exact name
// beats a prefix, which beats a word match, a substring, a college name, and so on
// down to one-letter typos and skipped letters ("cps" → "Computer Science").

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

function isSubsequence(needle, haystack) {
  let found = 0;
  for (let index = 0; index < haystack.length && found < needle.length; index += 1) {
    if (haystack[index] === needle[found]) found += 1;
  }
  return found === needle.length;
}

export function rankOptions(options, query) {
  const needle = normalizeText(query);
  if (!needle) return options;
  const words = needle.split(" ");
  const compact = needle.replace(/ /g, "");
  const ranked = [];

  options.forEach((option) => {
    const label = normalizeText(option.label);
    const group = normalizeText(option.group);
    const labelWords = label.split(" ");
    let score = Infinity;

    if (label === needle) score = 0;
    else if (label.startsWith(needle)) score = 1;
    else if (labelWords.some((word) => word.startsWith(needle))) score = 2;
    else if (label.includes(needle)) score = 3;
    else if (group.includes(needle)) score = 4;
    else if (words.every((word) => labelWords.some((labelWord) => labelWord.startsWith(word)))) score = 5;
    else if (compact.length >= 3 && isSubsequence(compact, label.replace(/ /g, ""))) score = 6;
    else if (words.every((word) => word.length >= 4 && labelWords.some((labelWord) => editDistance(word, labelWord) <= 1))) score = 7;

    if (score !== Infinity) ranked.push({ option, score, label });
  });

  ranked.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
  return ranked.map((entry) => entry.option);
}
