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

### Check

Use Deno to format, lint, type-check, test, and bundle the Action.

```sh
deno task fix
deno task test
deno task build:action
```

`deno task build:action` regenerates the committed ESM Action bundles in
`dist/`. Run it whenever changing the Action or digest source.

### Generate a digest

To generate a digest locally, set `LLM_API_KEY`, `LLM_API_BASE_URL`, and
`LLM_MODEL`. Set `LLM_BATCH_SIZE` to override the default of five articles per
request. Set `MAX_ARTICLES` or `MAX_ARTICLES_PER_FEED` to override the defaults
of 20 articles overall and 10 per feed. `MIN_FEED_CONTENT_CHARS` defaults to
1,000; shorter feed excerpts are replaced by the article page body. Then run:

```sh
deno task digest
```

### Generate a digest (test)

To test feed retrieval, parsing, and article extraction without configuring or
calling an LLM API, run:

```sh
deno task digest:dev
```

This emits a digest with placeholder summaries and does not update the
processed-article state file.
