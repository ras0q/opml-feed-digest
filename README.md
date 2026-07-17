# OPML Feed Digest

This public repository provides a GitHub Action that turns an OPML file into a
Markdown feed digest and manages its processed-article Cache. Its TypeScript
source is bundled with Deno; callers run only the committed Node 24 ESM bundle.
Keep your OPML file, Issue workflow, and LLM secret in a separate private
repository.

## Private repository setup

1. Create a private repository and add `feeds.opml`. The public Action checks
   out and reads this private repository; it does not receive your OPML file in
   the public repository.
2. Add `LLM_API_KEY` as a repository secret, and choose an OpenAI-compatible API
   base URL and model that support structured outputs.
3. Create `.github/workflows/feed-digest.yml` with the following workflow. Pin
   `ras0q/opml-feed-digest` to a release tag or commit SHA before enabling
   scheduled runs.

```yaml
name: Feed Digest

on:
  schedule:
    - cron: "0 23 * * *" # 08:00 JST
  workflow_dispatch:

permissions:
  contents: read
  issues: write

concurrency:
  group: feed-digest
  cancel-in-progress: false

jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: digest
        uses: ras0q/opml-feed-digest@<tag-or-sha>
        with:
          opml-path: feeds.opml
          state-path: .state/processed.json
          output-path: digest.md
          llm-api-key: ${{ secrets.LLM_API_KEY }}
          llm-api-base-url: ${{ vars.LLM_API_BASE_URL }}
          llm-model: ${{ vars.LLM_MODEL }}
          llm-batch-size: 5
      - name: Append digest comment
        if: steps.digest.outputs.has-new-articles == 'true'
        env:
          GH_TOKEN: ${{ github.token }}
          ISSUE_NUMBER: 123
        run: |
          jq -n --rawfile body digest.md '{body: $body}' > comment.json
          gh api --method POST \
            "repos/$GITHUB_REPOSITORY/issues/$ISSUE_NUMBER/comments" \
            --input comment.json
```

The Action restores the Cache before generating a digest. Its post step saves
the updated state only when the entire private workflow succeeds, so a failed
Issue comment is retried on the next run. The private workflow owns the
`GITHUB_TOKEN`; the public Action does not call the GitHub API or access Issue
history.

Each LLM request summarizes up to five articles by default. The selected model
must support Chat Completions structured outputs via
`response_format.type: json_schema`.

## Private feed endpoints

Keep `feeds.opml` in the private repository when the feed list itself is
sensitive. Feed URLs must still be reachable by a GitHub-hosted runner over HTTP
or HTTPS. Authenticated feed endpoints are not currently supported.
