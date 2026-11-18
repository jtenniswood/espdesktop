---
title: Cough Button for Mac Microphone Mute
description: Hold an EspDesktop touchscreen card to mute your Mac’s default microphone during a call.
---

# Cough button

Hold the **Cough** card to mute your Mac’s default microphone during a call. Lift your finger or slide off the card to restore the previous state. If your mic was already muted, it stays muted.

## Add the card

1. Pair your display with the Mac Companion app. Use firmware and a Mac app version that both include the Cough card.
2. In the display’s web editor, open **Layout** and select an empty tile on the home screen or inside a folder.
3. Choose **Sound** under **Mac Companion**, set **Type** to **Input Cough**, then save.

The card shows a crossed-out microphone when the Mac reports that the mic is muted. If the display disconnects while you’re holding the card, the Mac restores the mic’s previous state automatically.

## Hold to mute an OBS input

In the display editor, choose **Add Card → OBS Studio → Audio Controls**. Set **Type** to **Cough**, choose an input under **Source**, then save. Hold the card to mute that input. Lift your finger or slide off the card to restore its previous state when EspDesktop can verify the change. A source that was already muted stays muted. If OBS or the display disconnects during the hold, check the input in OBS before you unmute.

## If the card is unavailable

Check that the display is connected in the Mac app’s **Settings → Displays**.

For a Mac Cough card, check the selected microphone under **System Settings → Sound → Input**. The card needs a microphone that macOS can mute or whose input volume it can adjust. It controls the default Mac input, so check that your call app is using that same microphone.

For an OBS Cough card, check the connection under **Settings → OBS** in the EspDesktop Mac app. Then check that the card’s **Source** appears in the OBS Audio Mixer for the current scene collection.
