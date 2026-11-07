import { asteriskCensorStrategy, DataSet, englishDataset, englishRecommendedTransformers, parseRawPattern, RegExpMatcher, TextCensor } from 'obscenity';

/**
 * German words the English list doesn't know, as obscenity patterns, each with the common words that contain it and must
 * pass. A match masks its whole word, so a stem catches its forms ("scheis": Scheiße, Scheiß, scheissen). Small on
 * purpose: the words a children's table should not see, not every insult.
 */
const GERMAN: readonly { word: string; allow?: readonly string[] }[] = [
  { word: 'scheis' },
  { word: 'arschloch' },
  { word: 'wichser' },
  { word: 'wixer' },
  { word: 'fotze' },
  { word: 'hurensohn' },
  { word: 'fick', allow: ['fickle'] },
  { word: 'schlampe' },
  { word: 'missgeburt' },
  { word: 'spast', allow: ['spastic', 'spastik'] },
];

function germanDataset(): DataSet<{ originalWord: string }> {
  let set = new DataSet<{ originalWord: string }>();
  for (const { word, allow = [] } of GERMAN) {
    set = set.addPhrase((phrase) => {
      let p = phrase.setMetadata({ originalWord: word }).addPattern(parseRawPattern(word));
      for (const term of allow) p = p.addWhitelistedTerm(term);
      return p;
    });
  }
  return set;
}

// Two matchers, not one: a phrase added to obscenity's English dataset stops matching once merged into it.
const english = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const german = new RegExpMatcher({ ...germanDataset().build(), ...englishRecommendedTransformers });
const censor = new TextCensor().setStrategy(asteriskCensorStrategy());

/** ß and ẞ read as one s, so "Scheiße" matches "scheis"; one UTF-16 unit for one, so every position holds. */
const matchable = (text: string): string => text.replace(/[ßẞ]/g, 's');

/** Each German match widened to the word around it, overlaps merged, every letter of those words masked. */
function maskGermanWords(text: string): string {
  const spans: [number, number][] = [];
  for (const { startIndex, endIndex } of german.getAllMatches(matchable(text), true)) {
    let start = startIndex;
    let end = endIndex + 1;
    while (start > 0 && /\p{L}/u.test(text[start - 1]!)) start--;
    while (end < text.length && /\p{L}/u.test(text[end]!)) end++;
    const last = spans.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else spans.push([start, end]);
  }
  let out = text;
  for (const [start, end] of spans) out = out.slice(0, start) + '*'.repeat(end - start) + out.slice(end);
  return out;
}

/**
 * The family filter: every chat line and every player name at the table passes it. A matched word becomes asterisks and
 * the rest of the line is kept, so the table sees that something was said and what was masked. English by obscenity's
 * maintained list, which reads leetspeak ("sh1t") and stretched letters and lets "Scunthorpe" or "class" through; a
 * short German list on top. A word spelled out with spaces between its letters is not caught: matching across them masks
 * ordinary text ("as soon").
 */
export function familyFilter(text: string): string {
  const masked = censor.applyTo(text, english.getAllMatches(matchable(text), true));
  return maskGermanWords(masked);
}
