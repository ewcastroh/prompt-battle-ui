import { Pipe, PipeTransform } from '@angular/core';

/** `value` with exactly `digits` decimals in `locale`; `—` for null. */
@Pipe({ name: 'pbNum' })
export class NumberPipe implements PipeTransform {
  transform(value: number | null | undefined, digits: number, locale: string): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '—';
    }
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }
}

/** An ISO instant as a local time of day (`3:09:12 p. m.` / `3:09:12 PM`); `—` for null. */
@Pipe({ name: 'pbTime' })
export class TimePipe implements PipeTransform {
  transform(value: string | null | undefined, locale: string): string {
    const ms = value ? Date.parse(value) : NaN;
    if (Number.isNaN(ms)) {
      return '—';
    }
    return new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(ms);
  }
}
