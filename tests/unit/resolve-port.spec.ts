import { resolvePort } from '../../src/api/src/config/resolve-port';

describe('resolvePort', () => {
  it('prefers PORT when it is a valid number', () => {
    expect(resolvePort({ PORT: '4000' })).toBe(4000);
  });

  it('falls back to API_PORT when PORT is unset', () => {
    expect(resolvePort({ API_PORT: '3001' })).toBe(3001);
  });

  it('defaults to 3000 when no environment variable is set', () => {
    expect(resolvePort({})).toBe(3000);
  });

  it('skips a non-numeric PORT and keeps looking', () => {
    expect(resolvePort({ PORT: 'abc', API_PORT: '3002' })).toBe(3002);
  });

  it('skips values outside the TCP port range', () => {
    expect(resolvePort({ PORT: '70000', API_PORT: '0' })).toBe(3000);
  });
});
