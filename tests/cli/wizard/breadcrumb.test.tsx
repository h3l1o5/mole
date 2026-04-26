import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import {
  Breadcrumb,
  type BreadcrumbProps,
} from '../../../src/cli/wizard/breadcrumb';

const renderBreadcrumb = (overrides: Partial<BreadcrumbProps> = {}) =>
  render(
    <Breadcrumb
      step="host"
      hostName={null}
      profileName={null}
      innerWidth={80}
      {...overrides}
    />,
  );

describe('<Breadcrumb>', () => {
  test('host step shows step labels', () => {
    const { lastFrame } = renderBreadcrumb();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Host');
    expect(frame).toContain('Profile');
    expect(frame).toContain('Review');
  });

  test('shows host value once selected', () => {
    const { lastFrame } = renderBreadcrumb({
      step: 'profile',
      hostName: 'vbm',
    });
    expect(lastFrame()).toContain('vbm');
  });

  test('shows skipped value when profile is skipped', () => {
    const { lastFrame } = renderBreadcrumb({
      step: 'review',
      hostName: 'vbm',
      profileName: 'skip',
    });
    expect(lastFrame()).toContain('skipped');
  });

  test('fallback mode renders step counter when too narrow', () => {
    const { lastFrame } = renderBreadcrumb({
      step: 'profile',
      hostName: 'alice@verylonghost.example.com',
      innerWidth: 20,
    });
    expect(lastFrame()).toContain('2/3');
    expect(lastFrame()).toContain('Profile');
  });

  test('first segment has no leading space (no false indent)', () => {
    const { lastFrame } = renderBreadcrumb();
    const frame = lastFrame() ?? '';
    expect(frame.startsWith(' ')).toBe(false);
    expect(frame.startsWith('Host')).toBe(true);
  });

  test('inserts exactly one space between label and value', () => {
    const { lastFrame } = renderBreadcrumb({
      step: 'profile',
      hostName: 'vbm',
    });
    expect(lastFrame()).toContain('Host vbm');
  });

  test('frozen prop renders without crashing and keeps structure', () => {
    const { lastFrame } = renderBreadcrumb({
      step: 'review',
      hostName: 'vbm',
      profileName: 'agent',
      frozen: true,
    });
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Host vbm');
    expect(frame).toContain('Profile agent');
    expect(frame).toContain('Review');
  });

  test('frozen fallback mode renders step counter', () => {
    const { lastFrame } = renderBreadcrumb({
      step: 'profile',
      hostName: 'alice@verylonghost.example.com',
      innerWidth: 20,
      frozen: true,
    });
    expect(lastFrame()).toContain('2/3');
    expect(lastFrame()).toContain('Profile');
  });
});
