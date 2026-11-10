# Display Lifecycle Transition Contract

This document describes shared display-mode decisions and the effects that
apply them. Home Assistant alarm controls and presence subscriptions have been
retired. Saved Sensor screensaver and Night Schedule modes migrate to Disabled
before restored policy runs; time schedules and Mac playback remain supported.

The lifecycle controller decides **what should be visible**. ESPHome scripts
remain responsible for the physical effects: fades, LVGL page and widget changes,
touch guards, image release, and backlight writes.



## Scope and ownership

The current behaviour is spread across:

- `common/addon/backlight.yaml` for idle, touch wake, manual sleep,
  dimmed and clock presentation, setup dimming, and takeover suspension;
- `common/addon/backlight_schedule.yaml` for boot guard, scheduled modes,
  temporary off-hours wake, and brightness selection;
- `components/espdesktop/button_grid_image.h` for interactive image takeovers;
- generated device slot wiring under `devices/*/device/sensors.yaml`.

Normal control modals are not display modes. The shared controller retains
interactive and critical takeover priorities, but retired HA alarm cards no
longer create critical takeovers or block navigation and grid rebuilds.

## Controller vocabulary

The shared controller uses these values:

| Type | Values | Meaning |
|---|---|---|
| `DisplayMode` | `ACTIVE`, `SETUP_DIMMED`, `DIMMED`, `CLOCK`, `DISPLAY_OFF` | The one presentation mode that should be visible. |
| `DisplayRequestSource` | `ONBOARDING`, `BOOT_GUARD`, `IDLE_TIMER`, `PRESENCE_SENSOR`, `SCREEN_SCHEDULE`, `MANUAL_SLEEP`, `SETUP_TIMEOUT`, `USER_WAKE` | The event or policy currently requesting a mode. |
| `DisplayTakeoverKind` | `INTERACTIVE`, `CRITICAL` | Interactive or critical display priority; no HA alarm producer remains. |
| `DisplayTransition` | previous mode, target mode, winning source, generation | The complete decision handed to the effect adapter. |

Brightness is deliberately not a mode. The winning request selects the existing
normal, scheduled, temporary-wake, dimmed, or clock brightness calculation.

## Controller-owned and supporting state

The controller is the only source of presentation state. Readers use its target
mode for pending decisions and interaction blocking, and its current mode for
the presentation whose effects have completed. The winning request source
distinguishes schedule-owned clock or off states from idle-owned equivalents.

Supporting state remains outside the controller when it is not itself a display
mode. This includes the temporary-wake timer, touch-guard windows, persisted schedule and brightness settings, connectivity
setup state.

There are no mirrored presentation booleans. A request change invalidates older
effect generations, and the adapter converges the physical display directly to
the controller's current decision.

## Request priority

The controller resolves all current requests every time an input changes. The
first matching row wins.

| Priority | Condition | Winning result | Existing behaviour to preserve |
|---:|---|---|---|
| 1 | Critical takeover | `ACTIVE` | Shared controller priority, retained for internal callers; no HA alarm producer remains. |
| 2 | First-time onboarding | `ACTIVE` / `ONBOARDING` | WiFi and tile-configuration instructions remain fully visible while the grid is empty. Saved sleep, schedule, and setup-timeout policy cannot hide or dim setup. |
| 3 | Manual sleep | `DISPLAY_OFF` / `MANUAL_SLEEP` | Closes ordinary and interactive modals; next deliberate user wake clears it. |
| 4 | Temporary user wake | `ACTIVE` / `USER_WAKE` | Uses configured wake brightness until the existing 10–3600 second timeout expires. |
| 5 | Night schedule | Off, `CLOCK`, or `ACTIVE` / `SCREEN_SCHEDULE` | Off and clock close image modals; Screen Dimmed keeps the active UI at `schedule_dimmed_brightness`. An enabled time-based schedule fails dark until local time is valid, whether or not a saved sleep marker exists. |
| 6 | Interactive takeover | `ACTIVE`, image modal foreground | Automatic idle sleep is deferred. Manual sleep and scheduled off or clock may close it. |
| 8 | Idle timer | Configured `DIMMED`, `CLOCK`, or `DISPLAY_OFF` | Mac playback sleep prevention and shared takeover priorities defer idle sleep. |
| 9 | Setup timeout outside onboarding | `SETUP_DIMMED` / `SETUP_TIMEOUT` | Static setup pages may still use the existing burn-in dim path. |
| 10 | No request | `ACTIVE` / default | Normal UI at normal calculated brightness. |

When requests have equal priority, the most recently changed request may trigger
resolution, but the result is derived from current inputs rather than a saved
presentation. Clearing a request always runs the same resolver.

## Takeover and restoration rules

### Interactive takeover

Opening an image-style modal begins an `INTERACTIVE` takeover, cancels automatic
idle effects in flight, hides clock and dimmed presentations, removes
the dim touch guard, and presents active UI brightness. While it is open:

- automatic idle requests remain recorded but are not applied;
- media may change eligibility without replacing the modal;
- manual sleep and scheduled off or clock can close the modal and take effect;
- ordinary modals remain outside the lifecycle controller.

Closing the modal clears the takeover and resolves all current requests. It does
not restore a snapshot. For example, an idle timeout during the modal can resolve to the
configured idle mode, and a schedule
change can resolve to off or clock.

### Critical takeover

The shared controller's `CRITICAL` priority outranks ordinary requests and
resolves current requests when released. It has no HA alarm producer. Navigation
and generated grid rebuilds no longer consult an alarm context or wait for an
alarm state. Display takeover closes active shared controls through the same
modal lifecycle used by ordinary navigation.

### Touch wake

Grid cards send press, tap, and hold events to the navigation policy. The
ESPHome binding applies its decision to wake the screen, consume a wake
touch, or dispatch the card action. App page history is also decided before
the LVGL layer changes screens.

A deliberate user wake clears manual sleep and selects `ACTIVE`. During scheduled
off-hours it also starts the existing temporary-wake timer and uses temporary-wake
brightness. The first touch that wakes dimmed, clock, or display off is
consumed by the applicable touch guard and must not activate an underlying card.

## Transition invariants

These are true after every completed transition:

1. Exactly one of `ACTIVE`, `SETUP_DIMMED`, `DIMMED`, `CLOCK`, or
   `DISPLAY_OFF` is the presentation mode.
2. Only that mode's LVGL page or overlay is visible; ordinary modals are not
   counted as presentation modes.
3. The dim touch guard is visible only for `DIMMED`; wake guards exist only for
   their bounded touch-release or timeout window.
4. `DISPLAY_OFF` means the logical backlight is off and physical PWM is off.
   Fade samples do not publish intermediate brightness. The final off action
   checks both current and target light state, even when the last fade sample
   has already turned the physical light off.
   Repeated off checks do not republish or save the same state.
   Every non-off mode has logical mode, PWM, and selected brightness aligned.
5. The clock brightness source is scheduled-clock brightness for a schedule-owned
   clock and day/night clock brightness for an idle-owned clock.
7. The controller is the sole owner of target and current presentation state;
   no compatibility presentation flags mirror its decision.
8. Every accepted request, clear, or takeover change creates a newer transition
   generation. A delayed callback must match the current generation before it
   changes widgets, brightness, downloads, progress, or presentation.
9. Completing an obsolete generation has no effect, including no flag cleanup
   that could damage the current mode.
10. Releasing a takeover or clearing a request resolves live inputs; it never
    restores a saved transient presentation.

## Active display finalization

Every successful `ACTIVE` transition invokes `display_active_finalize`, as does
boot navigation. The finalizer waits for the effect adapter and page settling,
then restores the clock bar, configured brightness, and idle timers only while
the main page is active and the controller has no newer transition in progress.
An unchanged reconciliation does not restart the idle countdown.

The shared reconciler owns schedule exit: it clears temporary wake and stale
automatic sleep requests while preserving manual sleep. When the outgoing winner
is the scheduled clock, it records the current normal screensaver action before
resolving, avoiding an intermediate ACTIVE presentation and a fresh idle timeout.
Disabled screensavers, temporary user wake,
and Mac playback sleep prevention retain normal wake behavior. Scheduled Off and Screen
Dimmed also retain their normal wake behavior. Both the one-second
reconcile tick and the slower schedule check therefore reach the same completion
path. Detecting that edge only in `screen_schedule_check` loses it when the
one-second tick clears `SCREEN_SCHEDULE` first (issue #1787).

`tests/firmware/display_schedule_test.py` executes the production YAML lambdas
and ACTIVE action sequence with a virtual clock and hardware doubles. It covers
both callback orders, scheduled Clock/Off/Screen Dimmed, temporary wake, manual
sleep, stale finalization, boot, and an idle timeout that repeated polls cannot
postpone. Physical display timing still requires a device test.

## Expected event sequences

These sequences are the named baseline for later host tests and physical-device
tests. `gN` denotes a transition generation.

| Sequence | Events | Expected decisions and checks |
|---|---|---|
| Default boot | Boot, valid time, schedule normal | Resolve `ACTIVE`; after the main page settles, the shared active-display finalizer restores the clock bar and normal brightness and starts the idle timers. |
| First-time onboarding | Boot without WiFi or configured tiles; schedule, sleep, or setup-timeout requests change | `ONBOARDING` keeps the current setup instructions fully visible without a dimming timeout; adding the first tile clears onboarding and resolves live policy. |
| Fail-dark boot | Enabled time-based schedule; boot; time invalid; repeat before and after upgrading saved settings | `BOOT_GUARD` requests `DISPLAY_OFF` in both cases; PWM remains off. When time becomes valid, clear boot guard and resolve the live schedule. |
| Idle dim | `ACTIVE`; idle timeout; configured action Dim | `IDLE_TIMER` requests `DIMMED` at `g1`; normal UI remains beneath the dim guard; dim brightness applies. |
| Idle clock | `ACTIVE`; idle timeout; configured action Clock | `IDLE_TIMER` requests `CLOCK`; full-screen clock alone is visible at day/night clock brightness. |
| Idle off | `ACTIVE`; idle timeout; configured action Off | `IDLE_TIMER` requests `DISPLAY_OFF`; fade completes, off page is selected, logical backlight and PWM are off. |
| Wake from each inactive mode | Begin in `DIMMED`, `CLOCK`, then `DISPLAY_OFF`; touch each once | Each touch produces `USER_WAKE` and `ACTIVE`; presentation and stale guard are removed; the wake touch does not trigger the underlying UI. Cover art may re-request after its existing pause/delay. |
| Manual sleep | Any non-critical mode; long press; touch | `MANUAL_SLEEP` wins `DISPLAY_OFF`, clears temporary wake and closes interactive modal. Touch clears manual sleep and resolves `ACTIVE` or an off-hours temporary wake. |
| Scheduled off and automatic wake | `ACTIVE`; enter off-hours Off; enter normal hours | `SCREEN_SCHEDULE` selects `DISPLAY_OFF`; later clearing that request selects `ACTIVE`, waits for the main page to settle, restores its clock bar and configured brightness, and restarts idle handling through the shared active-display finalizer. |
| Scheduled clock | `ACTIVE`; enter off-hours Clock; setting or time changes | Select `CLOCK` with scheduled clock brightness. Re-evaluate current schedule on every change; do not restore a previous transient mode. |
| Temporary off-hours wake | Scheduled off or clock; touch; timeout | `USER_WAKE` selects `ACTIVE` at temporary-wake brightness. On existing timeout, clear it and re-resolve to the current scheduled off or clock mode. |
| Scheduled Screen Dimmed | Enter off-hours Screen Dimmed | `SCREEN_SCHEDULE` selects `ACTIVE` at `schedule_dimmed_brightness` and suppresses idle sleep for that period. The internal `screen_schedule_always_on_mode` helper name does not change the user-facing mode or its brightness contract. |
| Interactive modal defers idle | `ACTIVE`; open image modal; idle timeout or absence; close modal | `INTERACTIVE` keeps `ACTIVE` while recording the automatic request. Closing resolves to the current configured idle mode. |
| Schedule changes during interactive modal | Open image modal; enter scheduled off or clock | Schedule outranks interactive takeover, closes it, and applies off or clock. Entering normal hours before modal close is resolved from live schedule state. |
| Rapid opposing requests | Idle requests off `g1`; touch requests active `g2`; schedule requests clock `g3`; old fade callback from `g1` fires | Final mode is `CLOCK` from `g3`; callbacks from `g1` and `g2` are rejected and cannot change widgets or PWM. |
| Setup timeout | Static setup page on an already configured device; 120 seconds | `SETUP_TIMEOUT` selects `SETUP_DIMMED` at 50%. First-time onboarding suppresses this timeout so installation instructions remain fully visible. |

## Required test mapping for later stages

Host-side tests must cover every priority pair, every request-clear path, all
sequences above, and explicit stale-generation rejection. Behaviour-changing PRs
must also run focused parser, shared modal, legacy-card retirement, and generator checks;
the full fast repository check; and compilation for every supported display.

For the HA-removal branch, physical validation is scoped to the authorized
4-inch S3 after an exclusive testing window is available. Test touch wake, rapid
wake/sleep, clocks, dimming, scheduled and manual off,
local WiFi modals, screen-lock rejection, and saved-setting migration. Verify
Mac pairing, app icons, output volume, and microphone volume. Compilation is
separate from physical testing; every supported profile must still build.

## Remote Modal and Subpage Actions

The current shared resolver offers local WiFi QR/credential modals. Retired HA
cards have no modal target and cannot wake the panel through legacy fallbacks.
It resolves fresh configuration before and after waking, rejects screen lock or
an unready grid, and closes active shared controls before opening another one.
Saved layouts and retired identifiers remain readable and unchanged.

The native HA API and its action packages are still transitional dependencies
at this checkpoint; they must be removed before the HA-removal work is complete.
They are not a replacement for the supported Mac Companion connection.

The ACTIVE finalizer does not arm idle timers while onboarding owns the display; first-time setup stays visible until configuration is complete.

### S3 page presentation

The 4848S040 keeps its 12% LVGL draw buffer for rotation and uses two RGB
frame buffers. `on_draw_start` opens a refresh; all rotated strips are copied
into the inactive RGB frame. `on_draw_end` submits that complete frame and waits
for the ESP-IDF bounce-frame completion callback before reusing the old front
buffer. Only the changed rectangle is then mirrored into the next drawing
buffer, so partial updates preserve unchanged pixels. Page changes therefore
keep the previous page visible until the replacement is ready.

The second RGB frame uses 460,800 bytes of PSRAM, rather than enlarging both
LVGL's draw and software-rotation buffers. Other profiles retain their existing
presentation path. If the second RGB frame cannot be allocated at startup, the
S3 logs a warning and uses the original single-frame path. A presentation failure
or timeout stops further rendering rather than writing into a frame that might
still be scanned.
