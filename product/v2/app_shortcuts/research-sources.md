# Shortcut research sources

The expanded templates start with the original September 2026 macOS shortcut research. That index lists the vendor sources, keyboard layouts, coverage notes, and app versions. Shortcuts are keyed to the matching app: for example, the legacy ChatGPT bundle uses the Classic references, while the current ChatGPT Desktop bundle uses the current app commands.

Additional primary sources used to verify or extend the supplied research:

| App | Reference and scope |
| --- | --- |
| Apple Books | [Books for Mac keyboard shortcuts](https://support.apple.com/en-ca/guide/books/ibk0a716cf4-9a70-485b-9835-72e3c7ed6c29/mac) confirms the arrow and page-key alternatives. |
| Athena | [Athena's web client](https://github.com/jtenniswood/athena/tree/main/apps/web-desktop) defines the web composer, drawer and zoom controls. Desktop-only Hermes commands do not carry over. |
| ChatGPT Desktop and Classic | [Desktop commands](https://learn.chatgpt.com/docs/app/commands) and [Classic release notes](https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes) distinguish the apps and document the sharing bindings. |
| Claude Desktop | [Claude Code desktop reference](https://code.claude.com/docs/en/desktop#keyboard-shortcuts) documents the Code view, including terminal and browser controls. |
| FaceTime | [Apple's Mac shortcut list](https://support.apple.com/guide/facetime/keyboard-shortcuts-fctma3b7b94b/mac) and [call controls](https://support.apple.com/guide/facetime/change-audio-options-fctme7c07113/mac). Call controls with no published binding are not included. |
| Freeform | [Create or duplicate a board on Mac](https://support.apple.com/guide/freeform/create-a-board-frfm9474646a9/mac) confirms the board duplication chord. |
| Raycast | [Raycast keyboard shortcuts](https://manual.raycast.com/keyboard-shortcuts) adds common item, chat, form, and default navigation commands. |
| Safari web apps | [Apple's dedicated web app shortcut list](https://support.apple.com/guide/safari/keyboard-and-other-shortcuts-for-web-apps-ibrw3ceda9e7/mac) documents scrolling, Reader, and window controls. The website may handle some keys itself. |
| Visual Studio Code | [Default macOS keybindings](https://code.visualstudio.com/docs/reference/default-keybindings) fills gaps in the older printable reference, including the line comment chord. |
| VLC | [VideoLAN's macOS defaults in VLC 3.0](https://github.com/videolan/vlc/blob/3.0.x/src/libvlc-module.c) list playback, jumps, volume, subtitles, disc navigation, and bookmarks. |
| Zoom | [Zoom keyboard shortcuts for macOS](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0067050) lists separate microphone controls for meetings and Zoom Phone. |
| Icons | [Material Design Icons](https://pictogrammers.com/library/mdi/) 7.4.47. New glyphs cover formatting, alignment, duplication, subtitles, repeat and shuffle. |

Coverage depends on what each vendor publishes. Bindings can depend on the app version, keyboard layout, active view, selection, or a setting. Pointer gestures, ambiguous or unassigned bindings, modifier-only gestures, and shortcuts for unsupported keyboard hardware are excluded. A physical key press for every preset has not been tested.
