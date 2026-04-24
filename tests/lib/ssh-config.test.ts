import { test, expect, describe } from 'bun:test';
import { parseSshConfig } from '../../src/lib/ssh-config';

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

  test('takes first name when Host line has multiple', () => {
    const input = `Host primary alias\n    HostName p.com\n`;
    expect(parseSshConfig(input)).toEqual([
      { name: 'primary', hostname: 'p.com' },
    ]);
  });
});
