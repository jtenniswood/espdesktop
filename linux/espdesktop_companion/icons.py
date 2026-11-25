"""Render Linux application icons into the display's rgb565a8 format."""
from __future__ import annotations

import hashlib
from pathlib import Path

from PyQt6.QtCore import QRectF, QSize, Qt
from PyQt6.QtGui import QColor, QFont, QIcon, QImage, QPainter, QPixmap

from .catalogue import DesktopApp


def _load_icon(app: DesktopApp) -> QIcon:
    if app.icon:
        if app.icon.startswith("/") and Path(app.icon).is_file():
            icon = QIcon(app.icon)
            if not icon.isNull():
                return icon
        icon = QIcon.fromTheme(app.icon)
        if not icon.isNull():
            return icon
    return QIcon()


def _fallback_icon(app: DesktopApp, side: int) -> QPixmap:
    pixmap = QPixmap(side, side)
    pixmap.fill(Qt.GlobalColor.transparent)
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    digest = hashlib.sha256(app.id.encode("utf-8")).digest()
    colour = QColor.fromHsv(int(digest[0]) * 360 // 256, 110, 175)
    painter.setBrush(colour)
    painter.setPen(Qt.PenStyle.NoPen)
    radius = side * 0.18
    painter.drawRoundedRect(QRectF(2, 2, side - 4, side - 4), radius, radius)
    letter = (app.name.strip()[:1] or "?").upper()
    font = QFont()
    font.setPixelSize(int(side * 0.5))
    font.setBold(True)
    painter.setFont(font)
    painter.setPen(QColor(255, 255, 255))
    painter.drawText(QRectF(0, 0, side, side), Qt.AlignmentFlag.AlignCenter, letter)
    painter.end()
    return pixmap


def _draw_icon(image: QImage, pixmap: QPixmap) -> None:
    # Normalise to a 1:1 image first. QIcon can return pixmaps whose pixel
    # size and device pixel ratio disagree (oversized theme icons, fractional
    # scaling, or a ratio of 1 on a scaled desktop), so centring by either
    # value alone can place the icon partly outside the canvas.
    source = pixmap.toImage().convertToFormat(QImage.Format.Format_ARGB32_Premultiplied)
    source.setDevicePixelRatio(1.0)
    width, height = source.width(), source.height()
    if width <= 0 or height <= 0:
        return
    # Scale down to fit; small icons keep their native size and stay centred.
    scale = min(image.width() / width, image.height() / height, 1.0)
    target_width = max(1, round(width * scale))
    target_height = max(1, round(height * scale))
    if (target_width, target_height) != (width, height):
        source = source.scaled(target_width, target_height,
                               Qt.AspectRatioMode.KeepAspectRatio,
                               Qt.TransformationMode.SmoothTransformation)
        source.setDevicePixelRatio(1.0)
    painter = QPainter(image)
    painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
    painter.drawImage((image.width() - source.width()) // 2,
                      (image.height() - source.height()) // 2, source)
    painter.end()


def app_icon_rgb565a8(app: DesktopApp, side: int) -> bytes | None:
    if side < 16 or side > 512:
        return None
    icon = _load_icon(app)
    if icon.isNull():
        pixmap = _fallback_icon(app, side)
    else:
        pixmap = icon.pixmap(QSize(side, side))
    if pixmap.isNull():
        pixmap = _fallback_icon(app, side)
    image = QImage(side, side, QImage.Format.Format_ARGB32_Premultiplied)
    image.fill(Qt.GlobalColor.transparent)
    _draw_icon(image, pixmap)

    result = bytearray(side * side * 3)
    alpha_offset = side * side * 2
    for y in range(side):
        row = y * side
        for x in range(side):
            argb = image.pixel(x, y)
            alpha = (argb >> 24) & 0xFF
            red = (argb >> 16) & 0xFF
            green = (argb >> 8) & 0xFF
            blue = argb & 0xFF
            colour = ((red >> 3) << 11) | ((green >> 2) << 5) | (blue >> 3)
            index = row + x
            result[2 * index] = colour & 0xFF
            result[2 * index + 1] = (colour >> 8) & 0xFF
            result[alpha_offset + index] = alpha
    return bytes(result)
