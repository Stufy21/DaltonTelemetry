import { toQuery } from './openf1.query';

describe('toQuery', () => {
  it('joins comparison operators directly to the value', () => {
    expect(
      toQuery({
        session_key: 11388,
        'date>=': '2026-10-11T13:10:30.201Z',
        'date<': '2026-10-11T13:12:00Z',
      }),
    ).toBe('session_key=11388&date>=2026-10-11T13:10:30.201Z&date<2026-10-11T13:12:00Z');
  });

  it('keeps a strict lower bound strict', () => {
    expect(toQuery({ session_key: 1, 'date>': '2026-10-11T12:00:00Z' })).toBe(
      'session_key=1&date>2026-10-11T12:00:00Z',
    );
  });

  it('encodes plain parameters', () => {
    expect(toQuery({ session_key: 'latest', name: 'a b' })).toBe('session_key=latest&name=a%20b');
  });
});
