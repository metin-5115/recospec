<!-- Thanks for contributing to Recospec! Keep PRs focused on one logical change. -->

## What

<!-- A short summary of the change. -->

## Why

<!-- The problem this solves. Link the issue: Closes #123 -->

## How it was tested

<!-- Commands run + what you verified. e.g. `pnpm test`, loaded dist/ unpacked and recorded a login flow. -->

## Checklist

- [ ] Conventional Commit title (`type(scope): subject`)
- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
- [ ] New/changed behavior has tests (locator: positive + negative + edge; codegen: snapshot + parse/compile)
- [ ] No `any`, no `console.log`, no new magic numbers/strings, no floating promises
- [ ] Docs / CHANGELOG updated if user-facing
