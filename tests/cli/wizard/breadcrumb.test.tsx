import React from 'react';
import { test, expect, describe } from 'bun:test';
import { render } from 'ink-testing-library';
import { Breadcrumb } from '../../../src/cli/wizard/breadcrumb';

describe('<Breadcrumb>', () => {
  test('host step shows step labels', () => {
    const { lastFrame } = render(
      <Breadcrumb
        step="host"
        hostName={null}
        profileName={null}
        innerWidth={80}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Host');
    expect(frame).toContain('Profile');
    expect(frame).toContain('Review');
  });

  test('shows host value once selected', () => {
    const { lastFrame } = render(
      <Breadcrumb
        step="profile"
        hostName="vbm"
        profileName={null}
        innerWidth={80}
      />,
    );
    expect(lastFrame()).toContain('vbm');
  });

  test('shows skipped value when profile is skipped', () => {
    const { lastFrame } = render(
      <Breadcrumb
        step="review"
        hostName="vbm"
        profileName="skip"
        innerWidth={80}
      />,
    );
    expect(lastFrame()).toContain('skipped');
  });

  test('fallback mode renders step counter when too narrow', () => {
    const { lastFrame } = render(
      <Breadcrumb
        step="profile"
        hostName="alice@verylonghost.example.com"
        profileName={null}
        innerWidth={20}
      />,
    );
    expect(lastFrame()).toContain('2/3');
    expect(lastFrame()).toContain('Profile');
  });

  test('first segment has no leading space (no false indent)', () => {
    const { lastFrame } = render(
      <Breadcrumb
        step="host"
        hostName={null}
        profileName={null}
        innerWidth={80}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame.startsWith(' ')).toBe(false);
    expect(frame.startsWith('Host')).toBe(true);
  });

  test('inserts exactly one space between label and value', () => {
    const { lastFrame } = render(
      <Breadcrumb
        step="profile"
        hostName="vbm"
        profileName={null}
        innerWidth={80}
      />,
    );
    expect(lastFrame()).toContain('Host vbm');
  });

  test('frozen prop renders without crashing and keeps structure', () => {
    const { lastFrame } = render(
      <Breadcrumb
        step="review"
        hostName="vbm"
        profileName="agent"
        innerWidth={80}
        frozen
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Host vbm');
    expect(frame).toContain('Profile agent');
    expect(frame).toContain('Review');
  });

  test('frozen fallback mode renders step counter', () => {
    const { lastFrame } = render(
      <Breadcrumb
        step="profile"
        hostName="alice@verylonghost.example.com"
        profileName={null}
        innerWidth={20}
        frozen
      />,
    );
    expect(lastFrame()).toContain('2/3');
    expect(lastFrame()).toContain('Profile');
  });
});
