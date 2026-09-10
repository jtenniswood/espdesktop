---
title: Language Support
description:
  How EspDesktop language support works, what text is translated, and how to report or contribute translation updates.
---

# Language Support

Built-in display labels, status messages, month names and prompts use EspDesktop's translations. Custom card labels and application or folder names keep their original text.

The source list for that built-in screen text is the [English strings file](https://github.com/jtenniswood/espdesktop/blob/main/product/v2/translations/strings.en.txt). Each supported language has a matching file in the same folder.

## Webserver Translation

Translating the built-in webserver is out of scope. The webserver is a setup and configuration tool rather than the main user-facing screen experience, so translation work is focused on the display itself.

## Report a Mistranslation

If you find text on the screen that is translated incorrectly, please [raise a GitHub issue](https://github.com/jtenniswood/espdesktop/issues/new) and include:

- the language you are using
- the current text shown on the screen
- the corrected translation
- where you saw it, if that helps identify the text

If you are comfortable making the change yourself, you can also open a pull request. Use the [English strings file](https://github.com/jtenniswood/espdesktop/blob/main/product/v2/translations/strings.en.txt) as the reference and edit only the translated text after each `=`.

## Request a New Language

If you want EspDesktop to support another language, please [raise a GitHub issue](https://github.com/jtenniswood/espdesktop/issues/new). Ideally, include the translated content as part of the request, using the [English strings file](https://github.com/jtenniswood/espdesktop/blob/main/product/v2/translations/strings.en.txt) as the source.

New languages are much easier to add when a fluent speaker can provide or review the translations. Some languages may also need extra font characters before they can display correctly on the screen.
