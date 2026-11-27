from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PyQt6.QtCore import Qt  # noqa: E402
from PyQt6.QtGui import QColor, QGuiApplication, QImage, QPainter, QPixmap  # noqa: E402

from espdesktop_companion.icons import _draw_icon  # noqa: E402


def alpha_bounds(image: QImage) -> tuple[int, int, int, int]:
    left = top = image.width()
    right = bottom = image.width()
    found = False
    for y in range(image.height()):
        for x in range(image.width()):
            if (image.pixel(x, y) >> 24) & 0xFF == 0:
                continue
            found = True
            left = min(left, x)
            top = min(top, y)
            right = min(right, image.width() - 1 - x)
            bottom = min(bottom, image.height() - 1 - y)
    if not found:
        return (image.width(), image.height(), image.width(), image.height())
    return (left, top, right, bottom)


class IconDrawingTests(unittest.TestCase):
    app: QGuiApplication

    @classmethod
    def setUpClass(cls) -> None:
        cls.app = QGuiApplication.instance() or QGuiApplication([])

    def canvas(self) -> QImage:
        image = QImage(240, 240, QImage.Format.Format_ARGB32_Premultiplied)
        image.fill(Qt.GlobalColor.transparent)
        return image

    def test_high_dpi_pixmap_is_centred(self) -> None:
        pixmap = QPixmap(480, 480)
        pixmap.fill(Qt.GlobalColor.transparent)
        painter = QPainter(pixmap)
        painter.fillRect(60, 60, 360, 360, QColor(255, 0, 0))
        painter.end()
        pixmap.setDevicePixelRatio(2.0)

        image = self.canvas()
        _draw_icon(image, pixmap)

        # The 480 px source is 240 logical pixels; its inset artwork maps to
        # logical 30..209 and must be centred, not clipped to the top-left.
        self.assertEqual(alpha_bounds(image), (30, 30, 30, 30))

    def test_oversized_pixmap_is_fitted(self) -> None:
        pixmap = QPixmap(480, 480)
        pixmap.fill(Qt.GlobalColor.transparent)
        painter = QPainter(pixmap)
        painter.fillRect(60, 60, 360, 360, QColor(255, 0, 0))
        painter.end()

        # Some icon themes and scaled X11 sessions return a large pixmap with
        # a ratio of 1. It must be scaled down rather than cropped.
        image = self.canvas()
        _draw_icon(image, pixmap)

        self.assertEqual(alpha_bounds(image), (30, 30, 30, 30))

    def test_wide_pixmap_is_fitted(self) -> None:
        pixmap = QPixmap(480, 240)
        pixmap.fill(QColor(255, 0, 0))

        image = self.canvas()
        _draw_icon(image, pixmap)

        # Scaled to 240x120 and centred vertically.
        self.assertEqual(alpha_bounds(image), (0, 60, 0, 60))

    def test_normal_pixmap_is_centred(self) -> None:
        pixmap = QPixmap(120, 120)
        pixmap.fill(QColor(255, 0, 0))

        image = self.canvas()
        _draw_icon(image, pixmap)

        # Small icons keep their native size instead of being enlarged.
        self.assertEqual(alpha_bounds(image), (60, 60, 60, 60))


if __name__ == "__main__":
    unittest.main()
