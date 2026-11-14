# Token Usage

Show a weekly allowance or Claude Enterprise spend on a paired display. Each allowance card shows one service, the percentage remaining, and the time until its next reset. Add a card for each service to see multiple services.

1. Pair the display with the EspDesktop Mac app.
2. Open the Mac app’s **Settings** and find **Token Usage** on the connection page.
3. For ChatGPT (Codex), install the official Codex CLI, sign in with ChatGPT, and turn on sharing.
4. For Claude, install Claude Code, sign in with your Claude subscription, and turn on sharing. Your weekly plan limit must be visible in Claude Code’s `/usage` panel. API-key sessions do not include a subscription allowance.
5. For OpenCode Go, run `/connect` in OpenCode, select **OpenCode Go**, and enter your Go API key. Turn on OpenCode Go sharing in EspDesktop. The Mac uses your saved OpenCode login to read the weekly allowance. The key stays on the Mac and is sent only to OpenCode’s usage endpoint.
6. In the panel’s web editor, add **Token Usage**, select a service, and apply the layout.

The Mac app refreshes enabled services in the background every few minutes while sharing is enabled, including when the provider apps are closed. EspDesktop must be running on your Mac. The panel hides the reset countdown when the reading is stale or the reset time is unknown. It shows **Unavailable** until it has a weekly reading.

New ChatGPT and Claude app shortcut pages place the matching Token Usage card just after Back. To add it to an existing page, open the app card’s settings and save. If the layout has no room before its shortcuts, you can add or move the card in the subpage editor.

## Claude Enterprise spend

Select **Claude Enterprise** as the card’s service to show one user’s Claude Code spend in USD over the last seven days. This uses Anthropic’s usage-based Enterprise analytics. On older seat-based plans, Anthropic’s API reports usage credits only. Ask your organization’s primary owner for a key with the `read:analytics` scope and the user’s `user_…` ID. Enter both under **Token Usage** in EspDesktop Settings and select **Connect Claude Enterprise**. EspDesktop stores the key in macOS Keychain and sends only the amount and timestamp to the display.

The amount reflects usage costs after discounts, before credits. Anthropic’s figures usually arrive within four hours and can take up to 24 hours. [Anthropic Cost Analytics documentation](https://platform.claude.com/docs/en/manage-claude/usage-cost-analytics-api)
