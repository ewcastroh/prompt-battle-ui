import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../../core/i18n/language.service';
import { stubMotion } from '../../../testing/dom-stubs';
import { translocoTesting } from '../../../testing/transloco-testing';
import { SCORE_COUNT_MS, ScoreCountUp, easeOutCubic, formatScore } from './score-count-up';

describe('score count-up (SPEC §10.5, DESIGN.md §8)', () => {
  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [translocoTesting()] });
    await TestBed.inject(LanguageService).init();
  });

  afterEach(() => vi.useRealTimers());

  async function render(value: number) {
    const fixture = TestBed.createComponent(ScoreCountUp);
    const finished = vi.fn();
    fixture.componentInstance.finished.subscribe(finished);
    fixture.componentRef.setInput('value', value);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      finished,
      digits: () => element.querySelector('.digits')?.textContent ?? '',
      spoken: () => element.querySelector('.visually-hidden')?.textContent ?? '',
    };
  }

  it('formats one decimal in the active locale', () => {
    expect(formatScore(71.4, 'es-CO')).toBe('71,4');
    expect(formatScore(71.4, 'en')).toBe('71.4');
    expect(formatScore(100, 'en')).toBe('100.0');
  });

  it('eases out and lands exactly on the end', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeOutCubic(2)).toBe(1);
  });

  it('with reduced motion, shows the final value at once and reports it finished', async () => {
    stubMotion('reduce');
    const view = await render(88.3);
    expect(view.digits()).toBe('88,3');
    expect(view.spoken()).toBe('88,3');
    expect(view.finished).toHaveBeenCalledTimes(1);
  });

  it('counts again for a new step with the same score (tied podium places)', async () => {
    stubMotion('reduce');
    const view = await render(88.3);
    view.fixture.componentRef.setInput('key', 'PODIUM:5');
    await view.fixture.whenStable();
    expect(view.finished).toHaveBeenCalledTimes(2);
    expect(view.digits()).toBe('88,3');
  });

  it('with motion allowed, counts up and ends on the final value', async () => {
    stubMotion('no-preference');
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const view = await render(88.3);
    // Assistive technology hears only the final value, from the start.
    expect(view.spoken()).toBe('88,3');
    expect(view.digits()).toBe('0,0');
    expect(view.finished).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SCORE_COUNT_MS / 3);
    await view.fixture.whenStable();
    const middle = Number(view.digits().replace(',', '.'));
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(88.3);

    vi.advanceTimersByTime(SCORE_COUNT_MS);
    await view.fixture.whenStable();
    expect(view.digits()).toBe('88,3');
    expect(view.finished).toHaveBeenCalledTimes(1);
  });
});
