import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DescriptionText } from './description-text';

function render(text: string): HTMLElement {
  const fixture = TestBed.createComponent(DescriptionText);
  fixture.componentRef.setInput('text', text);
  fixture.detectChanges();
  return fixture.nativeElement;
}

describe('DescriptionText', () => {
  it('renders headings, lists, bold text and links', () => {
    const element = render(
      '## Deine Aufgaben\n\n- Java\n- **Spring** Boot\n\nMehr unter [Karriere](https://example.test/jobs)',
    );
    expect(element.querySelector('h4.level-2')?.textContent?.trim()).toBe('Deine Aufgaben');
    expect([...element.querySelectorAll('li')].map((item) => item.textContent?.trim())).toEqual([
      'Java',
      'Spring Boot',
    ]);
    expect(element.querySelector('li strong')?.textContent).toBe('Spring');
    const link = element.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.test/jobs');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('adds no spaces around bold text and links', () => {
    const element = render('a**b**c');
    expect(element.querySelector('p')?.textContent).toBe('abc');
  });

  it('marks a detected subheading without a size', () => {
    const element = render('DEINE AUFGABEN\n- Java');
    expect(element.querySelector('h4.subheading')?.textContent?.trim()).toBe('DEINE AUFGABEN');
  });
});
