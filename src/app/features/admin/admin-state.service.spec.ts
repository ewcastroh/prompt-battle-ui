import { TestBed } from '@angular/core/testing';
import { AdminState } from '../../core/api/api.models';
import { AdminApi } from './admin-api';
import { AdminStateService } from './admin-state.service';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function stateAt(step: number): AdminState {
  return {
    city: 'mde',
    phase: 'PODIUM_REVEAL',
    playersCount: 8,
    scoredRoundsDone: 2,
    round: null,
    miniPodium: null,
    podium: { roundId: null, size: 5, step, preview: [] },
    practiceGalleryShown: false,
  };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('AdminStateService', () => {
  let polls: Deferred<{ status: number; body: AdminState; etag: string; serverDate: null }>[];
  let actions: Deferred<AdminState>[];
  let service: AdminStateService;

  beforeEach(() => {
    polls = [];
    actions = [];
    const api = {
      state: () => {
        const d = deferred<{ status: number; body: AdminState; etag: string; serverDate: null }>();
        polls.push(d);
        return d.promise;
      },
      runAction: () => {
        const d = deferred<AdminState>();
        actions.push(d);
        return d.promise;
      },
    };
    TestBed.configureTestingModule({
      providers: [AdminStateService, { provide: AdminApi, useValue: api }],
    });
    service = TestBed.inject(AdminStateService);
  });

  afterEach(() => service.stop());

  it('drops a poll that started before an action and answers after it (no step going back)', async () => {
    service.start();
    polls[0].resolve({ status: 200, body: stateAt(2), etag: 'W/"2"', serverDate: null });
    await flush();
    expect(service.state()?.podium?.step).toBe(2);

    // A poll is in flight (the server answered it before "Next"), then the admin taps "Next".
    service.refresh();
    await new Promise<void>((r) => setTimeout(r, 2100)); // the next poll respects the 2 s interval
    expect(polls).toHaveLength(2);
    const acting = service.act({ kind: 'podium/next' });
    actions[0].resolve(stateAt(3));
    await acting;
    expect(service.state()?.podium?.step).toBe(3);

    polls[1].resolve({ status: 200, body: stateAt(2), etag: 'W/"2"', serverDate: null });
    await flush();
    expect(service.state()?.podium?.step).toBe(3);
  }, 10_000);

  it('a confirmed action waits for the action in flight instead of being dropped', async () => {
    const extend = service.act({ kind: 'extend', roundId: 'r1' });
    expect(await service.act({ kind: 'close', roundId: 'r1' })).toBeNull(); // a plain act is ignored
    expect(actions).toHaveLength(1);

    const close = service.actWhenIdle({ kind: 'close', roundId: 'r1' });
    await flush();
    expect(actions).toHaveLength(1); // still waiting for "+60 s"
    actions[0].resolve(stateAt(0));
    await extend;
    await flush();
    expect(actions).toHaveLength(2); // the close was sent
    expect(service.busy()).toBe('close');
    actions[1].resolve(stateAt(0));
    expect(await close).toBeNull();
  });
});
