# Developing EspDesktop

Developer documentation has moved into the topic-based pages under
[`dev-docs/`](dev-docs/README.md).

Start with the [EspDesktop Developer Reference](dev-docs/README.md), then use the
topic pages for architecture, card types, web configurator work, firmware,
devices, checks, and release-sensitive files.

Use Node.js 24 and the pinned ESPHome/Python dependencies from CI. Run
`npm run prepare:ci` before pushing to install locked dependencies, regenerate
derived outputs, and run the CI checks, docs build and browser editor checks.
CI reports independent failures together; release preflight still stops at the
first failure. Web bundles use explicit size budgets while retaining behavior
assertions. PR description validation remains part of CI Gate.
