# mole

macOS CLI that bridges the Mac clipboard and Chrome DevTools port to a remote Linux box over a single SSH connection. Long-running daemon + thin TUI client.

Stack: Bun + TypeScript + Ink/React + Unix socket.

## Commands

```bash
bun run dev:cli              # iterate on CLI; leave the launchd daemon running
bun run dev:daemon           # iterate on daemon (run daemon:stop first)
bun run preview              # snapshot every TUI state as plain text
bun run preview <view>       # one view: preflight | host-picker | profile-picker
bun test
bun run typecheck
```

## Daemon control

```bash
bun run daemon:stop          # bootout launchd
bun run daemon:start         # bootstrap launchd
bun run daemon:status        # PID / state
```

## Gotchas

**Run `./scripts/install.sh` once before shipping.** `bun run dev:*` runs source. The installer produces a `bun build --compile` single-file binary. The two paths diverge on `import.meta.dir`, `process.execPath`, and launchd's stripped environment.

**Run preview after every UI change.** `scripts/preview.tsx` is the TUI storybook — every new screen or state belongs in it. It catches marker/label alignment, empty-state copy, cross-state visual consistency, and validation-error layout that are hard to spot in the live TUI. Preview output is ANSI-stripped; review color and animation in a real terminal.

## UI/UX rules

**No component library.** No `@inkjs/ui` or wrappers. Hand-roll on Ink. All glyphs are printable ASCII so they sit on the baseline at width 1 across every terminal font — no Unicode, no `figures` package.

**Pull everything visual from `src/cli/components/theme.ts`:**

- Palette: `primary` (cyan), `success` (green), `error` (red), `warning` (yellow), `info` (blue)
- Icons: `tick`, `cross`, `info`, `warning`, `pointer`, `pointerSmall`, `ellipsis`, `bullet`, `arrowRight`
- Spinner: ASCII frames `|/-\` at 80 ms

Never hard-code color strings, glyphs, or spinner frames.

**Required patterns:**

- Validation errors render inline, prefixed with `colors.error` + `icons.warning`.
- Emphasis comes from color + icon, never bold — terminal font weights vary.
- Any async over 200 ms shows a spinner.
- `Ctrl+N` / `Ctrl+P` work everywhere arrow keys do.
- Arrow-key navigation skips disabled items (e.g. `busy` profiles).
