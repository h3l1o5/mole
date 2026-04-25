import { test, expect, describe } from 'bun:test';
import { parseSshConfig, describeHost } from '../../src/lib/ssh-config';

describe('parseSshConfig', () => {
  test('parses a single Host with HostName and User', () => {
    const input = `
Host foo
    HostName foo.example.com
    User alice
`;
    expect(parseSshConfig(input)).toEqual([
      { name: 'foo', hostname: 'foo.example.com', user: 'alice' },
    ]);
  });

  test('parses Host with only User set', () => {
    const input = `
Host work
    User kuanghung
`;
    expect(parseSshConfig(input)).toEqual([
      { name: 'work', user: 'kuanghung' },
    ]);
  });

  test('parses multiple Host entries', () => {
    const input = `
Host foo
    HostName a.com
Host bar
    HostName b.com
`;
    expect(parseSshConfig(input)).toEqual([
      { name: 'foo', hostname: 'a.com' },
      { name: 'bar', hostname: 'b.com' },
    ]);
  });

  test('skips wildcard Host entries', () => {
    const input = `
Host *
    IdentityFile ~/.ssh/id_rsa
Host foo
    HostName foo.com
Host *.internal
    User admin
`;
    expect(parseSshConfig(input)).toEqual([
      { name: 'foo', hostname: 'foo.com' },
    ]);
  });

  test('ignores comments and blank lines', () => {
    const input = `
# this is a comment
Host foo

    HostName foo.com
# trailing comment
`;
    expect(parseSshConfig(input)).toEqual([
      { name: 'foo', hostname: 'foo.com' },
    ]);
  });

  test('handles Host without HostName', () => {
    const input = `Host naked\n`;
    expect(parseSshConfig(input)).toEqual([{ name: 'naked' }]);
  });

  test('expands a multi-name Host line into one entry per name', () => {
    const input = `
Host odin thor loki
    HostName %h.syno
    User root
`;
    expect(parseSshConfig(input)).toEqual([
      { name: 'odin', hostname: '%h.syno', user: 'root' },
      { name: 'thor', hostname: '%h.syno', user: 'root' },
      { name: 'loki', hostname: '%h.syno', user: 'root' },
    ]);
  });

  test('skips negation patterns (! prefix) in a multi-name Host line', () => {
    const input = `
Host !work prod
    HostName p.com
`;
    expect(parseSshConfig(input)).toEqual([
      { name: 'prod', hostname: 'p.com' },
    ]);
  });

  test('supports key=value syntax in addition to key value', () => {
    const input = `
Host foo
    HostName=foo.com
    User=alice
`;
    expect(parseSshConfig(input)).toEqual([
      { name: 'foo', hostname: 'foo.com', user: 'alice' },
    ]);
  });

  test('expands %h to the alias when describing a host', () => {
    expect(
      describeHost({ name: 'odin', hostname: '%h.syno', user: 'root' }),
    ).toBe('root@odin.syno');
  });

  test('expands %n the same way as %h', () => {
    expect(
      describeHost({ name: 'odin', hostname: '%n.example.com' }),
    ).toBe('odin.example.com');
  });

  test('describes user-only host as user@alias', () => {
    expect(describeHost({ name: 'work', user: 'bob' })).toBe('bob@work');
  });

  test('returns undefined when neither user nor hostname set', () => {
    expect(describeHost({ name: 'naked' })).toBeUndefined();
  });

  test('a Match block does not leak its User into the previous Host', () => {
    const input = `
Host work
    HostName work.com
Match host work
    User alice
`;
    // We don't evaluate Match conditions at all. Treat Match as a hard
    // boundary so directives inside it can never accidentally land on
    // the previous Host.
    expect(parseSshConfig(input)).toEqual([
      { name: 'work', hostname: 'work.com' },
    ]);
  });
});
