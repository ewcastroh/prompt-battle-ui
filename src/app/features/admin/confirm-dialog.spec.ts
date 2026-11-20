import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiError } from '../../core/api/api-error';
import { LanguageService } from '../../core/i18n/language.service';
import { stubDialogs } from '../../../testing/dom-stubs';
import { translocoTesting } from '../../../testing/transloco-testing';
import { ConfirmDialog } from './confirm-dialog';
import { RESET_WORD } from './event/admin-event';

@Component({
  imports: [ConfirmDialog],
  template: `<pb-confirm-dialog
    heading="Reset?"
    confirmLabel="Reset event"
    [typedConfirmation]="typed()"
    [action]="action"
  />`,
})
class Host {
  readonly dialog = viewChild.required(ConfirmDialog);
  readonly typed = signal<string | null>(RESET_WORD);
  readonly action = vi.fn(async (): Promise<ApiError | null> => null);
}

describe('confirmation dialog (event reset with typed RESET)', () => {
  beforeEach(async () => {
    localStorage.clear();
    stubDialogs();
    TestBed.configureTestingModule({ imports: [translocoTesting()] });
    await TestBed.inject(LanguageService).init();
  });

  async function open() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    fixture.componentInstance.dialog().open();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector('input')!;
    const confirm = element.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const type = async (text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const submit = async () => {
      confirm.click();
      await fixture.whenStable();
    };
    return { fixture, element, input, confirm, type, submit };
  }

  it('sends nothing until RESET is typed exactly, and says why', async () => {
    const view = await open();
    const action = view.fixture.componentInstance.action;
    expect(view.confirm.getAttribute('aria-disabled')).toBe('true');

    await view.submit();
    expect(action).not.toHaveBeenCalled();
    expect(view.element.textContent).toContain('Escribe exactamente RESET');
    expect(view.input.getAttribute('aria-invalid')).toBe('true');

    await view.type('reset');
    await view.submit();
    expect(action).not.toHaveBeenCalled();

    await view.type('RESET');
    expect(view.confirm.getAttribute('aria-disabled')).toBeNull();
    await view.submit();
    expect(action).toHaveBeenCalledTimes(1);
    expect(view.element.querySelector('dialog')?.hasAttribute('open')).toBe(false);
  });

  it('keeps the dialog open and shows the error when the action fails', async () => {
    const view = await open();
    view.fixture.componentInstance.action.mockResolvedValueOnce(
      new ApiError(400, 'RESET_NOT_CONFIRMED'),
    );
    await view.type('RESET');
    await view.submit();
    expect(view.element.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect(view.element.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  });
});
