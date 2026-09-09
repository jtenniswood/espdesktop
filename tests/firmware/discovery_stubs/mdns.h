#pragma once
#include <cstddef>
#include <cstdint>
using esp_err_t = int;
struct mdns_txt_item_t { const char *key; const char *value; };
esp_err_t mdns_service_add(const char *, const char *, const char *, uint16_t, const mdns_txt_item_t *, size_t);
