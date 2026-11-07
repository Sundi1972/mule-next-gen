import { asteriskCensorStrategy, DataSet, englishDataset, englishRecommendedTransformers, parseRawPattern, RegExpMatcher, TextCensor } from 'obscenity';

/**
 * German words the English list doesn't know, as obscenity patterns (`[s]` an optional letter), each with the common
 * words that contain it and must pass. Small on purpose: the words a children's table should not see, not every insult.
 */
const GERMAN: readonly { word: string; allow?: readonly string[] }[] = [
  { word: 'scheis[s]e' },
  { word: 'arschloch' },
  { word: 'wichser' },
  { word: 'wixer' },
  { word: 'fotze' },
  { word: 'hurensohn' },
  { word: 'fick', allow: ['fickle'] },
  { word: 'schlampe' },
  { word: 'missgeburt' },
  { word: 'spast', allow: ['spastic'] },
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
const matchers = [englishDataset, germanDataset()].map((set) => new RegExpMatcher({ ...set.build(), ...englishRecommendedTransformers }));
const censor = new TextCensor().setStrategy(asteriskCensorStrategy());

/**
 * The family filter: every chat line and every player name at the table passes it. A matched word becomes asterisks and
 * the rest of the line is kept, so the table sees that something was said and what was masked. English by obscenity's
 * maintained list, which reads leetspeak ("sh1t") and stretched letters and lets "Scunthorpe" or "class" through; a
 * short German list on top. A word spelled out with spaces between its letters is not caught: matching across them masks
 * ordinary text ("as soon").
 */
export function familyFilter(text: string): string {
  let out = text;
  for (const matcher of matchers) {
    // ß read as one s, so "Scheiße" matches the pattern for "scheisse"; one character for one, so the positions hold.
    out = censor.applyTo(out, matcher.getAllMatches(out.replace(/ß/g, 's'), true));
  }
  return out;
}
