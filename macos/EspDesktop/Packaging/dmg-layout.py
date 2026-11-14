# dmgbuild supplies defines from the build script's command-line arguments.
files = [(defines["app"], "EspDesktop.app")]
symlinks = {"Applications": "/Applications"}
filesystem = "APFS"
format = "UDZO"
compression_level = 9

# Keep the icon centres level with the arrow at y=145 in the 640x320 artwork.
background = defines["background"]
window_rect = ((100, 100), (640, 320))
icon_locations = {"EspDesktop.app": (145, 145), "Applications": (495, 145)}
icon_size = 96
text_size = 14
