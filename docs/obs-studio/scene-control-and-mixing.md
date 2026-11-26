---
title: Switch OBS Scenes and Mix Transitions from a Touchscreen
description: Switch OBS scenes, take Preview live, and choose transitions from an EspDesktop touchscreen on Mac or Windows.
---

# Scene control and mixing

Scene, Program, Take Live, and transition controls work on Mac and Windows. **Program** is the live output. **Preview** is where you line up the next scene with Studio Mode on. [Connect OBS Studio](/obs-studio#connect-obs-studio), then open **Add Card → OBS Studio** in the display editor.

<picture>
  <source type="image/avif" srcset="/images/obs/scenes-480.avif 480w, /images/obs/scenes-960.avif 960w" sizes="(min-width: 768px) 688px, min(688px, 90vw)">
  <img src="/images/obs/scenes.jpg" alt="EspDesktop Scenes page with Studio live, Safari in Preview and Cut selected" width="1440" height="1440">
</picture>

Example with **Studio** live, **Safari** selected in Preview, and **Save Replay** beside **Take Safari**.

## Add grouped scene or transition pages

### Scenes

Choose **Grouped pages → Scenes** and save the card. The page fills with scenes from your current OBS scene collection. **Break**, **Transition**, and **Take Live** appear where there’s room. **Take Live** spans two columns by default.

Open **Edit Card** on the **Scenes** page card to hide or reorder scenes. In this example, all four are visible. Putting your most-used scenes first gives them the first available cells after **Back**.

<a href="/images/obs/scenes-settings.png">
  <picture>
    <source type="image/avif" srcset="/images/obs/scenes-settings-480.avif 480w, /images/obs/scenes-settings-960.avif 960w" sizes="(min-width: 768px) 688px, min(688px, 90vw)">
    <img src="/images/obs/scenes-settings.png" alt="Scenes subpage settings with reorder controls and visibility switches for Codex, Safari, Studio and Obsbot" width="1056" height="1252" loading="lazy" decoding="async">
  </picture>
</a>

<a href="/images/obs/scenes-layout.png">
  <picture>
    <source type="image/avif" srcset="/images/obs/scenes-layout-480.avif 480w, /images/obs/scenes-layout-960.avif 960w" sizes="(min-width: 768px) 688px, min(688px, 90vw)">
    <img src="/images/obs/scenes-layout.png" alt="Scenes grouped page with four scenes, Break, Transition set to Cut, and a wide Take Safari card" width="1189" height="1189" loading="lazy" decoding="async">
  </picture>
</a>

### Transitions

Choose **Grouped pages → Transitions** and save the card. It fills available cells with the transitions configured in OBS. Open **Edit Card** on the page card and expand the **Transitions** list to hide or reorder them.

<a href="/images/obs/transitions-layout.png">
  <picture>
    <source type="image/avif" srcset="/images/obs/transitions-layout-480.avif 480w, /images/obs/transitions-layout-960.avif 960w" sizes="(min-width: 768px) 688px, min(688px, 90vw)">
    <img src="/images/obs/transitions-layout.png" alt="Transitions grouped page with Fade and Cut cards, with Cut highlighted as the selected transition" width="1188" height="1188" loading="lazy" decoding="async">
  </picture>
</a>

## Preview a scene and take it live

Turn on **Studio Mode** in OBS or from a **Studio Mode** card to preview scenes first.

1. Use the **Scenes** page or add a **Scene** card and choose an **OBS scene**. With Studio Mode off, tapping the card changes **Program**. With Studio Mode on, it selects **Preview**. The card highlights the scene it controls. EspDesktop keeps the card’s binding if the scene becomes unavailable.
2. To see what’s live, add a **Studio Mode** card and set **Type** to **Program scene**. The card shows the name of the current Program scene with **Live** underneath.
3. To send Preview to Program, use **Take Live** on the Scenes page or add a **Studio Mode** card with **Type** set to **Take Live**. With Studio Mode on and Preview different from Program, the card is ready and shows the scene it will take live and the selected transition, such as **Take Safari** with **Cut** underneath. When both scenes match, it shows **Currently Live**. If Preview changes before the command reaches OBS, check the updated name before tapping again.

## Choose a transition

Under **Card types → Transitions**, select an option under **Type**.

| Type | What it does |
| --- | --- |
| **Cycle transitions** | Tap to step through the transitions configured in OBS. The card shows the selected transition and lights up while you press it. |
| **Select a transition** | Pick a specific **OBS transition**, such as **Cut**, **Fade**, or a custom transition. The card lights up when that transition is selected. |

In Studio Mode, choose the transition you want, then use **Take Live** to send Preview to Program.

## Switch to a break scene

1. In EspDesktop’s OBS settings, choose the scene viewers should see during your break and, optionally, the mixer input to mute. EspDesktop saves these choices for the current scene collection.
2. Use **Break** on the Scenes page or add it under **Card types → Break**. Tap **Start**. If you chose an input, EspDesktop verifies that it’s muted before switching Program.
3. Tap **Resume** to return to the previous scene. EspDesktop restores an input it muted when it can verify the changes.

Taking another scene live also ends the break and makes **Start** available again. If the microphone was muted during the break, check it in OBS before speaking. If the card says **Check OBS**, check the Program scene and microphone in OBS, then choose **Clear BRB alert** in **Break Settings**.
