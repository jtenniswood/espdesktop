# EspDesktop AI answer baseline

Sampled on 12 November 2026 before the discovery pull requests went live.
Google AI Mode used a signed-out browser and separate searches. ChatGPT ran
signed out with an explicit request to search the web and cite sources.
Each entry records one observed answer. Copilot and Claude showed sign-in
pages, so this baseline contains no results for those providers.

| Surface | Prompt | Observed answer | Source or destination |
| --- | --- | --- | --- |
| Google AI Mode | Can I use EspDesktop with a 2019 Intel Mac? | Missed the product's Apple silicon requirement. Discussed generic ESP32 flashers, Boot Camp and virtualisation. | Related sources included Microsoft Community Hub, ESP Component Registry and Home Assistant Community. No EspDesktop guide appeared in the captured sources. |
| Google AI Mode | Which Guition display do I buy for EspDesktop? | Said it could not verify a hardware compatibility list and listed three generic Guition options, including two outside the documented EspDesktop setup. | Related sources included Guition product listings. The official [4848S040 setup guide](https://espdesktop.com/screens/4848s040) was absent from the captured sources. |
| Google AI Mode | Does EspDesktop need Home Assistant? | Correctly said Mac controls do not require Home Assistant. It also described USB Mac control and optional smart-home cards in EspDesktop, which does not match the current setup documentation. | The [EspDesktop GitHub issues list](https://github.com/jtenniswood/espdesktop/issues) appeared among the results. |
| Google AI Mode | How do I install EspDesktop firmware in Safari? | Recommended Chrome and Edge for serial access. It also implied that EspDesktop's regular interface needs a Chromium browser and a USB serial connection. | It mentioned an unrelated GitHub desktop project and ESP flashing tools. |
| ChatGPT Search | Search the web and cite sources. Can I use EspDesktop with a 2019 Intel Mac? | Correctly identified Apple silicon and macOS 13 or newer as requirements. | Cited [GitHub releases](https://github.com/jtenniswood/espdesktop/releases) and the [former Mac app URL](https://espdesktop.com/getting-started/mac-app), which redirected to the 4848S040 setup page at the time of the test. |

## Checks against the live project

- The [FAQ](https://espdesktop.com/reference/faq) specifies Apple silicon,
  macOS 13 or newer, and the 4-inch Guition ESP32-S3 4848S040.
- The current browser installer manifest reported v1.2.6. The Mac download
  linked to the same release. [Firmware manifest](https://espdesktop.com/firmware/guition-esp32-s3-4848s040/manifest.json)
- Use Chrome or Edge to flash the display over USB. Mac control then uses the
  local network. Home Assistant controls use EspControl. [EspDesktop setup](https://espdesktop.com/screens/4848s040) · [EspControl setup](https://jtenniswood.github.io/espcontrol/screens/4848s040)
- Google Search Console reported verified ownership, a successfully processed
  sitemap with 22 discovered pages and Search generative AI inclusion enabled.
  The 28-day Web performance view displayed no data on the audit date.

Repeat these prompts after deployment and recrawling. Compare the factual
answer and final cited destination for each prompt, including whether the
answer distinguishes USB flashing from local-network Mac control.
