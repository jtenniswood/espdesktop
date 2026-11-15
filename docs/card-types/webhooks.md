---
title: "HTTP Webhook Cards"
description:
  How to use webhook cards on your EspDesktop panel to call HTTP URLs directly from the device.
---

# Webhook

A Webhook card is a one-tap HTTP request. It calls the URL directly from the panel, so it can trigger systems that expose simple web APIs using a separate network service.

Use Webhook cards for local automation platforms such as Jeedom, openHAB, Fibaro, or Node-RED. They also work with cloud webhook services such as IFTTT and Zapier when the panel can reach the service URL.

## Setting Up a Webhook Card

1. Select an empty slot in **Layout** and choose **Webhook**.
2. In **Webhook Settings**, choose the HTTP method from **Type** and enter the **URL**.
3. For POST, PUT or PATCH requests, add a **Body** if needed. Use **Headers** to send any required headers.
4. Set a **Label** and **Icon** for the card, then select **Save**.

## Common Examples

### Jeedom Scenario

Jeedom scenarios and commands often use HTTP GET URLs. Paste the full Jeedom API URL into the **URL** field and leave **Type** set to **GET**.

Example:

```text
http://jeedom.local/core/api/jeeApi.php?apikey=YOUR_KEY&type=scenario&id=56&action=start
```

### IFTTT or Zapier

Set **Type** to **POST**. Use the service webhook URL, add a JSON body if needed, and include:

```text
Content-Type: application/json
```

## Headers

Enter headers as `Name: value` pairs. Separate multiple headers with semicolons.

Example:

```text
Content-Type: application/json; Authorization: Bearer YOUR_TOKEN
```

If you enter a JSON-looking body and do not provide a `Content-Type` header, EspDesktop sends `Content-Type: application/json` automatically.

## Limits and Security

Webhook details are stored in the panel configuration. Anyone who can view or edit the device configuration may be able to see URLs, keys, or tokens saved in a Webhook card.

Keep destructive actions behind local-only or private URLs where possible. Avoid using a public webhook URL for actions such as unlocking a door or opening a garage unless the receiving system adds its own protection.

The saved card configuration is limited to 255 characters, so very long URLs, headers, or request bodies may need a shorter API endpoint or an automation relay such as Node-RED.
