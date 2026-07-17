# Contributing

[![Cute compatible](https://raw.githubusercontent.com/ras0q/cute/refs/heads/main/badge.svg)](https://github.com/ras0q/cute)

Follow the shared
[contribution guidelines](https://github.com/ras0q/.github/blob/main/CONTRIBUTING.md)
first.

## Setup

```sh
git config core.hooksPath .githooks
```

## Development

Use Deno to format, lint, type-check, test, and bundle the Action.

```sh
deno task fix
deno task test
deno task build:action
```

`deno task build:action` regenerates the committed ESM Action bundles in
`dist/`. Run it whenever changing the Action or digest source.

To generate a digest locally, set `LLM_API_KEY` and `LLM_API_BASE_URL`, then
run:

```sh
deno task digest
```
