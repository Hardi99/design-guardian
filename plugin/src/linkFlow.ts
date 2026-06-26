export type LinkState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'awaiting'; code: string }
  | { phase: 'linked'; token: string }
  | { phase: 'expired' }
  | { phase: 'error'; message: string };

export type LinkEvent =
  | { type: 'START' }
  | { type: 'STARTED'; code: string }
  | { type: 'POLL_APPROVED'; token: string }
  | { type: 'POLL_EXPIRED' }
  | { type: 'FAIL'; message: string }
  | { type: 'RESET' };

export function linkReducer(state: LinkState, ev: LinkEvent): LinkState {
  switch (ev.type) {
    case 'START':         return { phase: 'starting' };
    case 'STARTED':       return { phase: 'awaiting', code: ev.code };
    case 'POLL_APPROVED': return { phase: 'linked', token: ev.token };
    case 'POLL_EXPIRED':  return { phase: 'expired' };
    case 'FAIL':          return { phase: 'error', message: ev.message };
    case 'RESET':         return { phase: 'idle' };
    default:              return state;
  }
}
