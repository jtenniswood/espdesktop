"""Secure local Companion connection for supported EspDesktop panels.

The component deliberately runs a small, separate TLS WebSocket server.  It
does not use Home Assistant's API connection and it never initiates a network
connection to the Mac.
"""

import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import esp32, network, socket, uart
from esphome.const import CONF_ID, CONF_PORT, CONF_UART_ID

DEPENDENCIES = ["network"]
AUTO_LOAD = ["json", "mdns"]
CODEOWNERS = ["@jtenniswood"]
MULTI_CONF = False

CONF_USB_SERIAL_JTAG = "usb_serial_jtag"

companion_ns = cg.esphome_ns.namespace("companion")
CompanionService = companion_ns.class_("CompanionService", cg.Component)


def _reserve_network_resources(config):
    """Reserve the listener and client sockets before ESPHome sizes lwIP."""
    socket.consume_sockets(
        1, "companion_secure_websocket", socket.SocketType.TCP_LISTEN
    )(config)
    socket.consume_sockets(3, "companion_secure_websocket")(config)
    if CONF_UART_ID in config or config.get(CONF_USB_SERIAL_JTAG):
        socket.consume_sockets(2, "companion_usb_loopback")(config)
    return config


def _validate_native_usb(config):
    if config.get(CONF_USB_SERIAL_JTAG):
        esp32.only_on_variant(supported=[esp32.VARIANT_ESP32P4], msg_prefix="Companion native USB")(config)
    return config


CONFIG_SCHEMA = cv.All(
    cv.Schema(
        {
            cv.GenerateID(): cv.declare_id(CompanionService),
            cv.Exclusive(CONF_UART_ID, "companion_usb_transport"): cv.use_id(uart.UARTComponent),
            cv.Exclusive(CONF_USB_SERIAL_JTAG, "companion_usb_transport"): cv.boolean,
            cv.Optional(CONF_PORT, default=8443): cv.port,
        }
    ).extend(cv.COMPONENT_SCHEMA),
    cv.only_on_esp32,
    _validate_native_usb,
    _reserve_network_resources,
)


async def to_code(config):
    cg.add_define("USE_COMPANION")
    # Native ESP-IDF builds require the TLS server in the component dependency set.
    esp32.include_builtin_idf_component("esp_https_server")
    # Companion accepts encrypted connections; ESPHome otherwise trims TLS
    # to the client role and the server fails at the first handshake.
    esp32.request_tls()
    esp32.require_mbedtls_tls_server()
    esp32.add_idf_sdkconfig_option("CONFIG_HTTPD_WS_SUPPORT", True)
    esp32.add_idf_sdkconfig_option("CONFIG_HTTPD_WS_POST_HANDSHAKE_CB_SUPPORT", True)
    esp32.add_idf_sdkconfig_option("CONFIG_ESP_HTTPS_SERVER_ENABLE", True)
    esp32.add_idf_sdkconfig_option("CONFIG_MBEDTLS_X509_CRT_WRITE_C", True)

    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    cg.add(var.set_port(config[CONF_PORT]))
    if uart_id := config.get(CONF_UART_ID):
        cg.add_define("USE_COMPANION_USB")
        cg.add_define("USE_COMPANION_USB_UART")
        cg.add(var.set_usb_uart(await cg.get_variable(uart_id)))
    if config.get(CONF_USB_SERIAL_JTAG):
        cg.add_define("USE_COMPANION_USB")
        cg.add_define("USE_COMPANION_USB_JTAG")
        esp32.include_builtin_idf_component("esp_driver_usb_serial_jtag")
        esp32.add_idf_sdkconfig_option("CONFIG_USJ_ENABLE_USB_SERIAL_JTAG", True)
        esp32.add_idf_sdkconfig_option("CONFIG_ESP_CONSOLE_NONE", True)
        esp32.add_idf_sdkconfig_option("CONFIG_ESP_CONSOLE_SECONDARY_NONE", True)
        cg.add(var.enable_usb_serial_jtag())
