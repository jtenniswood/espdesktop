---
title: Built-in Relay Controls
description:
  How to control built-in panel relays locally.
---

# Built-in Relays

Some supported panels include physical relays that can switch external low-voltage circuits. The Guition 4-inch relay variant is often listed as **4848S040C** and includes three relays. The **ESP32-P4-86-Panel-ETH-2RO** includes two relays.

The relays are exposed by the standard firmware for each supported relay panel.

## Local Controls

Relay switches stay on until turned off. Relay push buttons pulse the output for 200 ms, then turn it off. The firmware no longer exposes these controls through the Home Assistant native API.

## Switches vs Push Buttons

Each relay has both a switch and a push button version because they suit different wiring jobs.

| Entity type | What it does | Typical uses |
|---|---|---|
| **Relay switch** | Turns the relay on and leaves it on until you turn it off. | Keeping a low-voltage light, LED strip, fan input, buzzer, or other simple circuit on for a while. |
| **Relay push button** | Pulses the relay on for 200 ms, then turns it off automatically. | Mimicking a quick press on a garage door input, gate opener, doorbell, dimmer, lighting controller, scene controller, or any device that expects a momentary button press. |

Use the switch version when the relay should represent an ongoing on/off state. Use the push button version when the connected device only needs a short signal and then takes care of the action itself.

## Using Relays on the Touchscreen

Use an **Internal Switches** card to control the physical relay directly on the panel.

Internal Switches cards have two modes:

- **Switch** — looks like a normal Switch card and toggles the selected relay on or off.
- **Push Button** — looks like a Trigger card and briefly pulses the selected relay.

1. Open the EspDesktop setup page in your browser.
2. Choose an empty card slot.
3. Change the type to **Internal Switches**.
4. Choose the relay you want to control.
5. Choose **Switch** or **Push Button** mode.
6. Save the card configuration.

The push button entities are useful when the relay is wired in parallel with existing momentary wall switches, for example when it is driving a dimmer or lighting controller that expects a short button press rather than a permanent on/off output.

## Startup Behaviour

The relay outputs default to **off** after startup or restart. This helps avoid a relay turning on unexpectedly when the panel reboots.

## Testing

After updating the firmware, test each relay using a local Internal Switches card before connecting it to anything important. You should hear or feel each relay click when it changes state.

## Safety

::: danger Electrical work can be dangerous
Always consult a qualified electrician before using the relay outputs, especially for anything connected to fixed wiring, mains voltage, garage doors, gates, heating equipment, or anything else that could cause injury or property damage.

Use the relay feature at your own risk. EspDesktop and its maintainers are not responsible or liable for damage, injury, code violations, incorrect wiring, equipment failure, or other losses caused by using the relay outputs.
:::

Check the relay rating printed on your board or supplied by the seller before connecting anything. Do not use the relays for mains voltage unless your specific relay board, wiring, enclosure, and local electrical rules make that safe.
