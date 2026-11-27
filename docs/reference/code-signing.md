---
title: EspDesktop code signing policy
description: How EspDesktop plans to sign its Windows releases and who approves them.
---

# Code signing policy

The available Windows installers are unsigned. EspDesktop is applying to the [SignPath Foundation open source program](https://signpath.org/terms). Once approved and enabled, the Windows release attribution will be:

> Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

**Committer, reviewer, and signing approver.** [James Tenniswood](https://github.com/jtenniswood), the project maintainer, reviews changes from outside contributors and manually approves each Windows release for signing. The team must use multi-factor authentication for GitHub and SignPath.

Windows installers are built by GitHub Actions from the release revision in the official [EspDesktop repository](https://github.com/jtenniswood/espdesktop). SignPath will verify the source of the submitted build before signing. The signing configuration must check the EspDesktop product name and release version on each binary submitted for signing.

See the [Windows privacy policy](/reference/privacy#espdesktop-windows-app) and [Windows installation and removal instructions](/windows).
