import { describe, it, expect } from 'vitest';
import { linkReducer, type LinkState } from './linkFlow.js';

describe('linkReducer', () => {
  it('idle → starting → awaiting → linked', () => {
    let s: LinkState = { phase: 'idle' };
    s = linkReducer(s, { type: 'START' });          expect(s.phase).toBe('starting');
    s = linkReducer(s, { type: 'STARTED', code: 'c' }); expect(s).toEqual({ phase: 'awaiting', code: 'c' });
    s = linkReducer(s, { type: 'POLL_APPROVED', token: 't' }); expect(s).toEqual({ phase: 'linked', token: 't' });
  });
  it('awaiting → expired', () => {
    const s = linkReducer({ phase: 'awaiting', code: 'c' }, { type: 'POLL_EXPIRED' });
    expect(s.phase).toBe('expired');
  });
  it('FAIL → error ; RESET → idle', () => {
    expect(linkReducer({ phase: 'starting' }, { type: 'FAIL', message: 'x' })).toEqual({ phase: 'error', message: 'x' });
    expect(linkReducer({ phase: 'expired' }, { type: 'RESET' })).toEqual({ phase: 'idle' });
  });
});
