import { Attempt, AttemptStatus } from '../../core/api/api.models';
import {
  PROMPT_MAX_LENGTH,
  counterLevel,
  duplicateOf,
  normalizePrompt,
  promptLength,
} from './prompt-text';
import { NICKNAME_MAX, nicknameProblem } from './join/nickname-rules';

function attempt(prompt: string, status: AttemptStatus = 'DONE'): Attempt {
  return {
    id: prompt,
    status,
    prompt,
    queuePosition: null,
    imageUrl: null,
    thumbUrl: null,
    code: null,
    createdAt: '2026-12-02T15:10:00.000Z',
  };
}

describe('prompt rules (SPEC §3.3)', () => {
  it('normalizes like the API: trim and collapse whitespace', () => {
    expect(normalizePrompt('  una   taza\nde\tcafé  ')).toBe('una taza de café');
    expect(normalizePrompt('   ')).toBe('');
  });

  it('counts what maxlength counts, so the counter matches the field', () => {
    expect(promptLength('café')).toBe(4);
    // An emoji is two UTF-16 units: the field (and the counter) count it twice.
    expect(promptLength('🚌')).toBe(2);
  });

  it('warns near the 300 limit and marks it full at 300', () => {
    expect(PROMPT_MAX_LENGTH).toBe(300);
    expect(counterLevel(0)).toBe('ok');
    expect(counterLevel(269)).toBe('ok');
    expect(counterLevel(270)).toBe('warn');
    expect(counterLevel(299)).toBe('warn');
    expect(counterLevel(300)).toBe('full');
  });

  it('finds a repeated prompt among finished or running attempts (D-024)', () => {
    const attempts = [attempt('una taza de café'), attempt('gato', 'QUEUED')];
    expect(duplicateOf('  una taza   de café ', attempts)?.id).toBe('una taza de café');
    expect(duplicateOf('gato', attempts)?.id).toBe('gato');
    // Case changes the prompt the model sees.
    expect(duplicateOf('Una taza de café', attempts)).toBeNull();
    expect(duplicateOf('', attempts)).toBeNull();
  });

  it('lets blocked and failed prompts be tried again', () => {
    const attempts = [attempt('chiva', 'BLOCKED'), attempt('perro', 'FAILED')];
    expect(duplicateOf('chiva', attempts)).toBeNull();
    expect(duplicateOf('perro', attempts)).toBeNull();
  });
});

describe('nickname rules (SPEC §3.1, mirrors the API)', () => {
  it('requires a nickname', () => {
    expect(nicknameProblem('')).toBe('required');
    expect(nicknameProblem('    ')).toBe('required');
  });

  it.each(['Ana', 'Ana_dev', 'José Ñandú', 'Pixel-Paisa 22', 'Valentina_Ospina', '李小龙'])(
    'accepts %s',
    (nickname) => expect(nicknameProblem(nickname)).toBeNull(),
  );

  it('accepts a decomposed accent (NFD), as the API normalizes to NFC', () => {
    expect(nicknameProblem('José')).toBeNull();
  });

  it.each(['Al', 'Valentina_Ospina1', 'ana@dev', 'hola!', 'emoji 🚌'])('rejects %s', (nickname) =>
    expect(nicknameProblem(nickname)).toBe('invalid'),
  );

  it('trims before counting', () => {
    expect(nicknameProblem('  Ana  ')).toBeNull();
    expect(NICKNAME_MAX).toBe(16);
  });
});
