import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IMAGE_RETRY_DELAYS_MS, ImageRetry, withRetryFragment } from './image-retry';

@Component({
  imports: [ImageRetry],
  template: `<img pbImageRetry src="https://api.test/img/a_thumb.jpg" alt="Attempt 1" />`,
})
class Host {}

describe('ImageRetry', () => {
  afterEach(() => vi.useRealTimers());

  it('tags a URL, or every URL of a srcset, with a retry fragment', () => {
    expect(withRetryFragment('https://api.test/img/a.jpg', 1, false)).toBe(
      'https://api.test/img/a.jpg#retry-1',
    );
    expect(withRetryFragment('https://api.test/img/a.jpg#retry-1', 2, false)).toBe(
      'https://api.test/img/a.jpg#retry-2',
    );
    expect(
      withRetryFragment(
        'https://api.test/img/a_thumb.jpg 384w, https://api.test/img/a.jpg 1024w',
        1,
        true,
      ),
    ).toBe(
      'https://api.test/img/a_thumb.jpg#retry-1 384w, https://api.test/img/a.jpg#retry-1 1024w',
    );
    expect(withRetryFragment('data:image/svg+xml,abc', 1, false)).toBe('data:image/svg+xml,abc');
  });

  it('reloads a failed image with backoff, three times at most', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const img = (fixture.nativeElement as HTMLElement).querySelector('img')!;
    // Only setTimeout: Angular's scheduler also races requestAnimationFrame.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    for (let attempt = 1; attempt <= IMAGE_RETRY_DELAYS_MS.length; attempt++) {
      img.dispatchEvent(new Event('error'));
      await vi.advanceTimersByTimeAsync(IMAGE_RETRY_DELAYS_MS[attempt - 1]);
      expect(img.getAttribute('src')).toBe(`https://api.test/img/a_thumb.jpg#retry-${attempt}`);
    }
    img.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(img.getAttribute('src')).toBe('https://api.test/img/a_thumb.jpg#retry-3');
  });
});
