# Panel identity storage

The deployed 16 MB and 32 MB layouts both contain a 2 MiB `card_images`
partition. The final 16 KiB (offset `0x1fc000`) is reserved for panel identity.
The 7-inch and 10-inch Guition P4 profiles use two 128 KiB configuration slots
immediately before the identity area. On upgrade, firmware copies the newest
valid layout from the original flash slots at the beginning of the partition
or from shared NVS. The original copy stays intact. Firmware with an older
partition table that lacks `card_images` continues to use shared NVS.

The application icon cache shares the space between the configuration regions.
`panel_flash_layout.h` defines the shared offsets. Older firmware reads its
original layout and may reuse the expanded space as an icon cache after a
downgrade. Export a backup before downgrading if you need edits made on the
new firmware.

Identity opens this region as an independent ESP-IDF NVS store using a persistent
partition descriptor and `nvs_flash_init_partition_ptr`. This avoids sharing the
space consumed by ESPHome preferences and does not change the partition table,
so existing panels can receive the change over OTA. Shared NVS is never erased.

On first use, a valid identity record from the original `espdesktop_id` namespace
is copied into the dedicated store. A dedicated record, including an empty name,
takes precedence thereafter. Devices without `card_images` retain shared NVS
support; unexpected layouts fail closed. Downgrading to the initial naming
implementation reads its older shared-NVS record, not the dedicated store.

The ESPHome startup adapter supports 2026.9 through 2026.11. Review its
Application StringRef lifetime assumptions, partition ownership and NVS API
usage when upgrading ESPHome.
