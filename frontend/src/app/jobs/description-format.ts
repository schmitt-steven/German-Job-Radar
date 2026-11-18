// Turns a stored description into blocks (paragraphs, lists, headings).

export interface Span {
  text: string;
  isBold: boolean;
  /** Only http and https links. */
  href: string | null;
}

export type DescriptionBlock =
  | { kind: 'heading'; level: number; spans: Span[] }
  | { kind: 'subheading'; spans: Span[] }
  | { kind: 'paragraph'; spans: Span[] }
  | { kind: 'list'; items: Span[][] };

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const MARKDOWN_HEADING = /^(#{1,6})\s+(\S.*)$/;
const BULLET = /^\s*[-*•·–]\s+(\S.*)$/;
const BOLD_ONLY = /^\*{2,3}([^*]+?)\*{2,3}\s*:?$/;
const END_PUNCTUATION = /[.,;!?:]$/;
const OPENING_QUOTE = /^[„"“‚'»]/;
const INLINE = /\[([^\]]*)\]\(([^)\s]*)\)|\*{2,3}([^*\s](?:[^*\n]*[^*\s])?)\*{2,3}/g;

const MAX_BOLD_ONLY = 90;
const MAX_CAPS = 80;
const MAX_COLON = 70;
const MAX_BARE = 60;

function cleanUp(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);|&#(\d+);|&([a-z]+);/gi, (entity, hex, decimal, name) => {
      if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
      const code = hex ? parseInt(hex, 16) : parseInt(decimal, 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .replace(/\r/g, '')
    .replace(/ /g, ' ')
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '$1');
}

function isCapsLine(line: string): boolean {
  if (line.length > MAX_CAPS || OPENING_QUOTE.test(line) || line.startsWith('#')) return false;
  const letters = [...line].filter((char) => char.toLowerCase() !== char.toUpperCase());
  const upper = letters.filter((char) => char === char.toUpperCase());
  return letters.length >= 4 && upper.length / letters.length > 0.85;
}

/** Bold, links, and what is left of a broken `**` dropped. */
function parseSpans(text: string): Span[] {
  const spans: Span[] = [];
  const addText = (value: string, isBold: boolean, href: string | null) => {
    const clean = value.replace(/\*{2,}/g, '').replace(/ {2,}/g, ' ');
    if (clean) spans.push({ text: clean, isBold, href });
  };
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    addText(text.slice(last, match.index), false, null);
    if (match[3] !== undefined) {
      addText(match[3], true, null);
    } else {
      const isWebLink = /^https?:\/\//i.test(match[2]);
      addText(match[1].trim() || match[2], false, isWebLink ? match[2] : null);
    }
    last = match.index + match[0].length;
  }
  addText(text.slice(last), false, null);
  return spans;
}

function withoutColon(text: string): string {
  return text.replace(/\s*:$/, '');
}

export function parseDescription(description: string): DescriptionBlock[] {
  const lines = cleanUp(description).split('\n');
  const blocks: DescriptionBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', spans: parseSpans(paragraph.join('\n')) });
      paragraph = [];
    }
  };

  const nextNonBlank = (from: number): string | undefined =>
    lines.slice(from).find((line) => line.trim() !== '');

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      return;
    }

    const heading = MARKDOWN_HEADING.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: 'heading', level: heading[1].length, spans: parseSpans(heading[2]) });
      return;
    }

    const bullet = BULLET.exec(raw);
    if (bullet) {
      flushParagraph();
      const item = parseSpans(bullet[1].trim());
      const previous = blocks[blocks.length - 1];
      if (previous?.kind === 'list') previous.items.push(item);
      else blocks.push({ kind: 'list', items: [item] });
      return;
    }

    const boldOnly = line.length <= MAX_BOLD_ONLY ? BOLD_ONLY.exec(line) : null;
    const isBlankBefore = index === 0 || lines[index - 1].trim() === '';
    const next = nextNonBlank(index + 1);
    const isSubheading =
      boldOnly !== null ||
      isCapsLine(line) ||
      (line.length <= MAX_COLON && line.endsWith(':') && !line.includes('. ')) ||
      (line.length <= MAX_BARE &&
        !END_PUNCTUATION.test(line) &&
        !line.startsWith('#') &&
        isBlankBefore &&
        next !== undefined &&
        BULLET.test(next));

    if (isSubheading) {
      flushParagraph();
      blocks.push({ kind: 'subheading', spans: parseSpans(withoutColon(boldOnly?.[1] ?? line)) });
      return;
    }

    paragraph.push(line);
  });
  flushParagraph();

  return blocks.filter((block) => block.kind === 'list' || block.spans.length > 0);
}
