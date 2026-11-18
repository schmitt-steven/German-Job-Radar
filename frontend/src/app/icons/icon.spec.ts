import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Icon } from './icon';
import { IconName } from './icon-paths';

@Component({
  imports: [Icon],
  template: `<app-icon [name]="name" [size]="size" />`,
})
class Host {
  name: IconName = 'close-outline';
  size = 20;
}

describe('Icon', () => {
  it('draws every path of the icon at the given size, hidden from assistive tech', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const svg: SVGElement = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.getAttribute('height')).toBe('20');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('path')).toHaveLength(2);
  });

  it('follows the name', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.name = 'favorite-filled';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('path')).toHaveLength(1);
  });
});
