# Contributing

Use Node 24.18.0 and npm 11.16.0. Install with `npm ci`, make focused changes, add tests, and run `npm run check`.

Core modules must not import Obsidian. Never target an ordinary Vault with fixtures or cleanup tools. Keep pull requests self-contained and use Conventional Commit subjects.
