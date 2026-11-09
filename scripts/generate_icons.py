"""Generate the app icon, tray icon and Windows ICO for 浮笺.

Run with a Python environment that has Pillow:
    python scripts/generate_icons.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
RESOURCES = ROOT / "resources"

CANVAS = 1024
SS = 2


def rounded_mask(size: int, radius: int, inset: int = 0) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (inset, inset, size - inset - 1, size - inset - 1),
        radius=radius,
        fill=255,
    )
    return mask


def diagonal_gradient(size: int, start: tuple[int, int, int], end: tuple[int, int, int]) -> Image.Image:
    y, x = np.mgrid[0:size, 0:size]
    t = (x + y) / (2 * (size - 1))
    t = np.clip(t * 1.06 - 0.02, 0, 1)[..., np.newaxis]
    start_arr = np.array(start, dtype=np.float32)
    end_arr = np.array(end, dtype=np.float32)
    rgb = start_arr * (1 - t) + end_arr * t
    alpha = np.full((size, size, 1), 255, dtype=np.float32)
    return Image.fromarray(np.uint8(np.concatenate([rgb, alpha], axis=2)), "RGBA")


def radial_glow(size: int, center: tuple[float, float], radius: float,
                color: tuple[int, int, int], strength: int) -> Image.Image:
    y, x = np.mgrid[0:size, 0:size]
    dist = np.sqrt((x - center[0]) ** 2 + (y - center[1]) ** 2)
    alpha = np.clip(1 - dist / radius, 0, 1) ** 2 * strength
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., 0] = color[0]
    rgba[..., 1] = color[1]
    rgba[..., 2] = color[2]
    rgba[..., 3] = alpha.astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def four_point_star(image: Image.Image, cx: int, cy: int, radius: int,
                    color: tuple[int, int, int, int]) -> None:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    inner = int(radius * 0.26)
    points = [
        (cx, cy - radius),
        (cx + inner, cy - inner),
        (cx + radius, cy),
        (cx + inner, cy + inner),
        (cx, cy + radius),
        (cx - inner, cy + inner),
        (cx - radius, cy),
        (cx - inner, cy - inner),
    ]
    draw.polygon(points, fill=color)
    image.alpha_composite(layer)


def make_app_icon() -> Image.Image:
    size = CANVAS * SS
    scale = lambda value: int(value * SS)  # noqa: E731

    base = diagonal_gradient(size, (91, 141, 239), (137, 103, 246))
    base.alpha_composite(
        radial_glow(size, (size * 0.26, size * 0.18), size * 0.55,
                    (255, 255, 255), 72)
    )
    base.alpha_composite(
        radial_glow(size, (size * 0.84, size * 0.92), size * 0.5,
                    (43, 50, 121), 48)
    )
    base.putalpha(rounded_mask(size, radius=scale(225), inset=scale(10)))

    # Soft inner border for the squircle.
    border = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(border)
    bdraw.rounded_rectangle(
        (scale(10), scale(10), size - scale(10) - 1, size - scale(10) - 1),
        radius=scale(225),
        outline=(255, 255, 255, 70),
        width=scale(3),
    )
    base.alpha_composite(border)

    # Note shadow.
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle(
        (scale(252), scale(252), scale(790), scale(818)),
        radius=scale(82),
        fill=(29, 36, 85, 92),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(scale(28)))
    base.alpha_composite(shadow)

    # Tilted cream note.
    note_size = size
    note = Image.new("RGBA", (note_size, note_size), (0, 0, 0, 0))
    ndraw = ImageDraw.Draw(note)
    ndraw.rounded_rectangle(
        (scale(244), scale(196), scale(780), scale(768)),
        radius=scale(80),
        fill=(255, 252, 246, 255),
    )

    # Subtle warm paper shading at the bottom.
    paper_shade = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(paper_shade)
    pdraw.rounded_rectangle(
        (scale(244), scale(596), scale(780), scale(768)),
        radius=scale(80),
        fill=(229, 224, 231, 135),
    )
    pdraw.rectangle((scale(244), scale(596), scale(780), scale(768 - 80)),
                    fill=(229, 224, 231, 135))
    note.alpha_composite(paper_shade)
    note = note.rotate(-4.5, resample=Image.Resampling.BICUBIC, center=(scale(512), scale(482)))
    base.alpha_composite(note)

    # Content lines and completion tick.
    glyph = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glyph)
    gdraw.rounded_rectangle(
        (scale(326), scale(380), scale(682), scale(414)),
        radius=scale(17),
        fill=(116, 132, 186, 255),
    )
    gdraw.rounded_rectangle(
        (scale(326), scale(462), scale(594), scale(494)),
        radius=scale(16),
        fill=(193, 202, 230, 255),
    )
    # Check circle.
    gdraw.ellipse(
        (scale(318), scale(540), scale(412), scale(634)),
        fill=(91, 141, 239, 255),
    )
    gdraw.line(
        [(scale(342), scale(586)), (scale(365), scale(609)), (scale(396), scale(565))],
        fill=(255, 255, 255, 255),
        width=scale(13),
        joint="curve",
    )
    gdraw.rounded_rectangle(
        (scale(440), scale(564), scale(686), scale(596)),
        radius=scale(16),
        fill=(193, 202, 230, 255),
    )
    glyph = glyph.rotate(-4.5, resample=Image.Resampling.BICUBIC, center=(scale(512), scale(482)))
    base.alpha_composite(glyph)

    # Golden spark.
    four_point_star(base, scale(760), scale(252), scale(72), (255, 205, 100, 255))
    four_point_star(base, scale(818), scale(326), scale(25), (255, 232, 176, 235))

    return base.resize((CANVAS, CANVAS), Image.Resampling.LANCZOS)


def make_tray_icon(app_icon: Image.Image) -> Image.Image:
    icon = app_icon.resize((64, 64), Image.Resampling.LANCZOS)
    tray = Image.new("RGBA", (72, 72), (0, 0, 0, 0))
    tray.alpha_composite(icon, (4, 4))
    return tray.resize((32, 32), Image.Resampling.LANCZOS)


def make_macos_tray_template() -> Image.Image:
    """A 16x high-resolution monochrome note glyph for the macOS menu bar.

    Template images must be black with alpha; AppKit recolours them for light,
    dark and highlighted menu bar states. Drawn large and downsampled so the
    18pt / 36px assets stay crisp.
    """
    scale = 16
    size = 18 * scale
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def px(value: float) -> float:
        return value * scale

    ink = (0, 0, 0, 255)
    stroke = px(1.35)
    draw.rounded_rectangle(
        (px(3.0), px(1.7), px(15.0), px(16.3)),
        radius=px(2.3),
        outline=ink,
        width=round(stroke),
    )

    for y in (7.4, 10.1, 12.8):
        start = (px(6.2), px(y))
        end = (px(11.8), px(y))
        draw.line((start, end), fill=ink, width=round(stroke))
        radius = stroke / 2
        for x, cy in (start, end):
            draw.ellipse((x - radius, cy - radius, x + radius, cy + radius), fill=ink)

    return image.resize((36, 36), Image.Resampling.LANCZOS)


def main() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    RESOURCES.mkdir(parents=True, exist_ok=True)

    app_icon = make_app_icon()
    app_icon.save(RESOURCES / "app-icon.png", "PNG")
    app_icon.resize((256, 256), Image.Resampling.LANCZOS).save(
        RESOURCES / "app-icon-256.png", "PNG"
    )

    tray_icon = make_tray_icon(app_icon)
    tray_icon.save(RESOURCES / "tray.png", "PNG")

    macos_tray = make_macos_tray_template()
    macos_tray.save(RESOURCES / "trayTemplate@2x.png", "PNG")
    macos_tray.resize((18, 18), Image.Resampling.LANCZOS).save(
        RESOURCES / "trayTemplate.png", "PNG"
    )

    ico_sizes = [(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48),
                 (64, 64), (128, 128), (256, 256)]
    app_icon.save(BUILD / "icon.ico", format="ICO", sizes=ico_sizes)
    app_icon.save(BUILD / "icon.png", "PNG")

    print("Generated:")
    for path in [
        BUILD / "icon.ico",
        BUILD / "icon.png",
        RESOURCES / "app-icon.png",
        RESOURCES / "app-icon-256.png",
        RESOURCES / "tray.png",
        RESOURCES / "trayTemplate.png",
        RESOURCES / "trayTemplate@2x.png",
    ]:
        print(f"  {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
