import { describe, expect, it } from 'vitest';
import { DescriptionBlock, Span, parseDescription } from './description-format';

const plain = (spans: Span[]) => spans.map((span) => span.text).join('');

/** One short string per block: "h2 Titel", "sub Titel", "ul 3", "p Text". */
function outline(text: string): string[] {
  return parseDescription(text).map((block: DescriptionBlock) => {
    switch (block.kind) {
      case 'heading':
        return `h${block.level} ${plain(block.spans)}`;
      case 'subheading':
        return `sub ${plain(block.spans)}`;
      case 'list':
        return `ul ${block.items.length}`;
      case 'paragraph':
        return `p ${plain(block.spans)}`;
    }
  });
}

// Shortened from real Arbeitsagentur descriptions.
const MARKDOWN = `#                                    Softwareentwickler (m/w/d)

Gestaltungskraft zeichnet unsere ca. 100 Mitarbeiter\\*innen aus. Dich auch? Dann #machmIT!

## Deine Aufgaben

- Entwicklung von Softwarelösungen mit Java, Spring Boot und Angular.
- Aufbau von CI/CD-Pipelines.

## Das erwarten wir von Dir

- Mehrjährige Berufserfahrung (mind. 3 Jahre).
- Sehr gute Deutsch- sowie Basis-Englischkenntnisse.

**Haben wir Dein Interesse geweckt?**

Sende uns Deine Bewerbung.
#LI-MA1`;

const CAPS_AND_STAR_BULLETS = `www.example.test

Zum frühestmöglichen Zeitpunkt suchen wir mehrere

C++ SOFTWAREENTWICKLER (M/W/D)

IHRE AUFGABEN (JE NACH ERFAHRUNG):

 * Entwicklung moderner Software mit C++20
 * Weiterentwicklung unserer 3D-Komponenten

IHR PROFIL:
 * Abgeschlossenes Studium der Informatik
 * Sehr gute Kenntnisse in C++

Senden Sie Ihre Unterlagen an
Frau Mustermann
Beispielweg 2 ■ 38114 Braunschweig`;

const BULLET_DOTS = `Wo Du mit anpacken kannst
 • In enger Zusammenarbeit mit Kunden entstehen smarte Lösungen.
 • Du bewegst Dich zwischen macOS-Client, Server und Datenbank.

Was Du mitbringen solltest
 • Ein gutes abgeschlossenes Studium.

Deine Vorteile bei uns:
 • Super Team
 • Flexible Arbeitszeiten

Warum wir?Wir sind ein offenes Team.`;

const BOLD_HEADINGS = `Technologien auf das nächste Level zu heben - dafür benötigen wir Expert:innen wie dich.

## Embedded-Software-Entwickler (m/w/d)

**Dein Aufgabengebiet**
* Du entwickelst und pflegst Embedded Software
* Optimierung von Entwicklungswerkzeugen

**Das bringst du mit**
* Abgeschlossenes Studium

Bewerbungsformular: [Zum Bewerbungsformular](https://recruiting.example.test/job/1)`;

const BLOB = `Willkommen bei TecFox Du entwickelst mit Begeisterung leistungsstarke Backend-Systeme. Deine Aufgaben In Deiner Position arbeitest Du an modernen Systemen: Entwicklung von Backend-Systemen Konzeption von Microservices Das bringst Du mit Du passt besonders gut zu uns`;

describe('parseDescription', () => {
  it('formats a Markdown description', () => {
    expect(outline(MARKDOWN)).toEqual([
      'h1 Softwareentwickler (m/w/d)',
      'p Gestaltungskraft zeichnet unsere ca. 100 Mitarbeiter*innen aus. Dich auch? Dann #machmIT!',
      'h2 Deine Aufgaben',
      'ul 2',
      'h2 Das erwarten wir von Dir',
      'ul 2',
      'sub Haben wir Dein Interesse geweckt?',
      'p Sende uns Deine Bewerbung.\n#LI-MA1',
    ]);
  });

  it('formats caps headings, colon headings and star bullets', () => {
    expect(outline(CAPS_AND_STAR_BULLETS)).toEqual([
      'p www.example.test',
      'p Zum frühestmöglichen Zeitpunkt suchen wir mehrere',
      'sub C++ SOFTWAREENTWICKLER (M/W/D)',
      'sub IHRE AUFGABEN (JE NACH ERFAHRUNG)',
      'ul 2',
      'sub IHR PROFIL',
      'ul 2',
      'p Senden Sie Ihre Unterlagen an\nFrau Mustermann\nBeispielweg 2 ■ 38114 Braunschweig',
    ]);
  });

  it('finds bare headings before bullets and keeps glued words as they are', () => {
    expect(outline(BULLET_DOTS)).toEqual([
      'sub Wo Du mit anpacken kannst',
      'ul 2',
      'sub Was Du mitbringen solltest',
      'ul 1',
      'sub Deine Vorteile bei uns',
      'ul 2',
      'p Warum wir?Wir sind ein offenes Team.',
    ]);
  });

  it('formats bold headings and web links', () => {
    const blocks = parseDescription(BOLD_HEADINGS);
    expect(outline(BOLD_HEADINGS)).toEqual([
      'p Technologien auf das nächste Level zu heben - dafür benötigen wir Expert:innen wie dich.',
      'h2 Embedded-Software-Entwickler (m/w/d)',
      'sub Dein Aufgabengebiet',
      'ul 2',
      'sub Das bringst du mit',
      'ul 1',
      'p Bewerbungsformular: Zum Bewerbungsformular',
    ]);
    const last = blocks[blocks.length - 1];
    expect(last.kind === 'paragraph' && last.spans[1]).toEqual({
      text: 'Zum Bewerbungsformular',
      isBold: false,
      href: 'https://recruiting.example.test/job/1',
    });
  });

  it('leaves a text without line breaks as one paragraph', () => {
    expect(outline(BLOB)).toEqual([`p ${BLOB}`]);
  });

  it('does not take a recruiter hashtag or a quote in caps for a heading', () => {
    expect(outline('#LI-DS1')).toEqual(['p #LI-DS1']);
    expect(outline('„WER BESONDERE ZIELE HAT, BRAUCHT BESONDERE KÖPFE!“')).toEqual([
      'p „WER BESONDERE ZIELE HAT, BRAUCHT BESONDERE KÖPFE!“',
    ]);
  });

  it('keeps a bullet that ends with a colon a bullet', () => {
    expect(outline('- Folgende Kenntnisse:\n- Java')).toEqual(['ul 2']);
  });

  it('does not take a sentence or contact line for a bare heading', () => {
    expect(outline('Das ist ein Satz.\n- Eins')).toEqual(['p Das ist ein Satz.', 'ul 1']);
    expect(outline('Text\nTelefon: 0531 123\n\n- Eins')).toEqual(['p Text\nTelefon: 0531 123', 'ul 1']);
  });

  it('turns bold text inside a line into bold spans', () => {
    const [block] = parseDescription('**Individuelle Entwicklung**: In unserem Programm.');
    expect(block.kind === 'paragraph' && block.spans).toEqual([
      { text: 'Individuelle Entwicklung', isBold: true, href: null },
      { text: ': In unserem Programm.', isBold: false, href: null },
    ]);
  });

  it('keeps gender stars and drops a broken **', () => {
    expect(outline('Software-Entwickler*in gesucht')).toEqual(['p Software-Entwickler*in gesucht']);
    expect(outline('einen** *** Softwareentwickler (m/w/d) ** -** zur Erweiterung')).toEqual([
      'p einen Softwareentwickler (m/w/d) - zur Erweiterung',
    ]);
  });

  it('decodes entities and shows only the label of a link that is not http', () => {
    expect(outline('Was wir von Dir erwarten:&#32;&amp; mehr')).toEqual([
      'p Was wir von Dir erwarten: & mehr',
    ]);
    const [block] = parseDescription('Mail [an uns](mailto:a@b.test) und [hier](http://a.test)');
    expect(block.kind === 'paragraph' && block.spans).toEqual([
      { text: 'Mail ', isBold: false, href: null },
      { text: 'an uns', isBold: false, href: null },
      { text: ' und ', isBold: false, href: null },
      { text: 'hier', isBold: false, href: 'http://a.test' },
    ]);
  });

  it('returns no blocks for an empty text', () => {
    expect(parseDescription('')).toEqual([]);
    expect(parseDescription('\n \n')).toEqual([]);
  });
});
