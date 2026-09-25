# Bridge

**Chat plans. Codex builds. Bridge keeps them working together.**

[![CI](https://github.com/JHees/chatgpt-codex-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/JHees/chatgpt-codex-bridge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

English · [简体中文](README.zh-CN.md)

Bridge is a [Codex Script Loader](https://github.com/JHees/codex-script-loader) plugin that connects a Chat planner to your current Codex task. Pair Chat Pro or another reasoning model with a fast Codex executor to write code, fix bugs, and review changes.

## Why Bridge?

Working with two models usually means carrying plans, code, and test results between conversations yourself. Bridge handles that exchange automatically.

Chat breaks down the task, proposes changes, and reviews the results. Codex reviews the proposed actions, edits local files, runs commands and tests, then sends the results back. You describe the outcome and steer the work from the same task.

## Highlights

- **Choose each model independently.** Set Chat's model and thinking level while keeping your preferred Codex executor.
- **Automatic back-and-forth.** Plans, progress, and test results flow between the two models without manual copying.
- **Work through the task.** Chat adjusts its guidance as results come back, guiding the next steps until the task is complete.
- **Built into your workflow.** Start collaboration from the Codex input area and keep working in the current task.

## Get started

Requires Windows, the Codex desktop app with Chat access, **Codex Script Loader 0.5.12+**, and **PowerShell 7**.

1. Download `bridge-<version>.zip` from [Releases](https://github.com/JHees/chatgpt-codex-bridge/releases), then install and enable it in Loader.
2. Open Bridge from the Codex input area, select your Chat model and thinking level, and enable collaboration.
3. Send your request with the collaboration instructions that Bridge adds.

![Bridge in the Codex input area](docs/images/bridge-composer.png)

For example:

> Fix this bug. Have Chat work out the solution and guide Codex through the code changes and tests, then review the results.

[Usage guide](docs/USAGE.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Report an issue](https://github.com/JHees/chatgpt-codex-bridge/issues)

## License

[MIT](LICENSE).
