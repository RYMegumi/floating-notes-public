"""Frame the raw UI captures and compose the README hero image.

Run after tests/preview.mjs:
    python scripts/frame_previews.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "docs" / "raw"
OUT = ROOT / "docs"
ICON = ROOT / "resources" / "app-icon.png"

FONT_REGULAR = "C:/Windows/Fonts/msyh.ttc"
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size, index=0)


def rounded_mask(width: int, height: int, radius: int) -> Image.Image:
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill=255)
    return mask


def rounded_widget(source: Image.Image, radius: int) -> Image.Image:
    image = source.convert("RGBA")
    image.putalpha(rounded_mask(image.width, image.height, radius))
    return image


def shadow_for(widget: Image.Image, padding: int, blur: int, offset_y: int,
               opacity: int) -> tuple[Image.Image, tuple[int, int]]:
    canvas_width = widget.width + padding * 2
    canvas_height = widget.height + padding * 2 + offset_y
    shadow = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    shadow_mask = Image.new("L", (canvas_width, canvas_height), 0)
    mask_draw = ImageDraw.Draw(shadow_mask)
    mask_draw.rounded_rectangle(
        (padding, padding + offset_y, padding + widget.width, padding + widget.height + offset_y),
        radius=22,
        fill=opacity,
    )
    shadow.putalpha(shadow_mask)
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    return shadow, (padding, padding)


def frame_individual(source: Image.Image, radius: int = 22) -> Image.Image:
    widget = rounded_widget(source, radius)
    padding = 42
    offset = 18
    width = widget.width + padding * 2
    height = widget.height + padding * 2 + offset
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    shadow, _ = shadow_for(widget, padding, 26, offset, 105)
    canvas.alpha_composite(shadow, (0, 0))
    canvas.alpha_composite(widget, (padding, padding))
    return canvas


def make_background(width: int, height: int) -> Image.Image:
    y, x = np.mgrid[0:height, 0:width]
    t = (y / height) * 0.75 + (x / width) * 0.25
    start = np.array([8, 15, 26], dtype=np.float32)
    end = np.array([17, 32, 46], dtype=np.float32)
    rgb = start[None, None, :] * (1 - t[..., None]) + end[None, None, :] * t[..., None]
    base = Image.fromarray(np.uint8(np.clip(rgb, 0, 255)), "RGB").convert("RGBA")

    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse((-350, -420, 900, 500), fill=(255, 167, 91, 120))
    draw.ellipse((1120, -380, 2140, 520), fill=(58, 125, 255, 138))
    draw.ellipse((-420, 560, 780, 1450), fill=(163, 84, 212, 88))
    draw.ellipse((1120, 660, 2180, 1400), fill=(48, 200, 178, 72))
    draw.ellipse((650, -180, 1250, 300), fill=(255, 255, 255, 18))
    glow = glow.filter(ImageFilter.GaussianBlur(170))
    base.alpha_composite(glow)

    # A soft translucent diagonal band gives the backdrop a desktop-wallpaper feel.
    band = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    band_draw = ImageDraw.Draw(band)
    band_draw.polygon(
        [(0, height * 0.62), (width, height * 0.22), (width, height * 0.4), (0, height * 0.82)],
        fill=(255, 255, 255, 10),
    )
    band = band.filter(ImageFilter.GaussianBlur(90))
    base.alpha_composite(band)

    # Vignette.
    vignette = Image.new("L", (width, height), 0)
    vdraw = ImageDraw.Draw(vignette)
    vdraw.rectangle((0, 0, width, height), fill=50)
    vdraw.ellipse((-width * 0.15, -height * 0.2, width * 1.15, height * 1.2), fill=0)
    vignette = vignette.filter(ImageFilter.GaussianBlur(180))
    dark = Image.new("RGBA", (width, height), (2, 5, 10, 255))
    dark.putalpha(vignette)
    base.alpha_composite(dark)

    grain = np.random.default_rng(4).normal(0, 3.1, (height, width, 1))
    noise = np.repeat(grain, 3, axis=2)
    base_array = np.asarray(base, dtype=np.float32)
    base_array[..., :3] = np.clip(base_array[..., :3] + noise, 0, 255)
    return Image.fromarray(np.uint8(base_array), "RGBA")


def make_hero() -> Image.Image:
    width, height = 1800, 1080
    canvas = make_background(width, height)

    dark = Image.open(RAW / "preview-dark.png")
    light = Image.open(RAW / "preview-light.png")

    display_width = 720
    dark = dark.resize(
        (display_width, round(dark.height * display_width / dark.width)),
        Image.Resampling.LANCZOS,
    )
    light = light.resize(
        (display_width, round(light.height * display_width / light.width)),
        Image.Resampling.LANCZOS,
    )

    labels = [
        ("深色模式", 130),
        ("浅色模式", 950),
    ]
    label_font = font(FONT_BOLD, 22)
    for text, x in labels:
        ImageDraw.Draw(canvas).text((x, 258), text, font=label_font, fill=(235, 241, 249, 155))

    def place(widget: Image.Image, x: int, y: int) -> None:
        widget = rounded_widget(widget, 22)
        blur = 42
        offset = 26
        shadow_mask = Image.new("L", canvas.size, 0)
        sd = ImageDraw.Draw(shadow_mask)
        sd.rounded_rectangle(
            (x, y + offset, x + widget.width, y + widget.height + offset),
            radius=22,
            fill=145,
        )
        shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(blur))
        shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        shadow.putalpha(shadow_mask)
        canvas.alpha_composite(shadow)
        canvas.alpha_composite(widget, (x, y))

    place(dark, 130, 306)
    place(light, 950, 306)

    # Header.
    icon = Image.open(ICON).convert("RGBA").resize((78, 78), Image.Resampling.LANCZOS)
    canvas.alpha_composite(icon, (130, 78))

    title_font = font(FONT_BOLD, 58)
    kicker_font = font(FONT_REGULAR, 22)
    subtitle_font = font(FONT_REGULAR, 25)
    badge_font = font(FONT_BOLD, 18)
    draw = ImageDraw.Draw(canvas)
    draw.text((226, 82), "浮笺", font=title_font, fill=(247, 243, 236, 255))
    draw.text((132, 182), "把今天，轻轻放在桌面上。", font=subtitle_font, fill=(234, 240, 248, 158))

    # Top-right badge.
    badge_text = "Windows 11 · 原生毛玻璃"
    badge_box = (1390, 94, 1670, 142)
    badge_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    badge_draw = ImageDraw.Draw(badge_layer)
    badge_draw.rounded_rectangle(badge_box, radius=24, fill=(255, 255, 255, 16))
    badge_draw.rounded_rectangle(badge_box, radius=24, outline=(255, 255, 255, 24), width=1)
    badge_text_width = badge_draw.textlength(badge_text, font=badge_font)
    badge_draw.text(
        ((badge_box[0] + badge_box[2] - badge_text_width) / 2, 108),
        badge_text,
        font=badge_font,
        fill=(238, 244, 252, 170),
    )
    canvas.alpha_composite(badge_layer)

    # Small descriptor below the widgets.
    descriptor_font = font(FONT_REGULAR, 19)
    draw.text(
        (130, 1024),
        "默认贴桌面 · 可一键置顶 · 右键归档 · 专注模式",
        font=descriptor_font,
        fill=(222, 232, 244, 105),
    )
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    for name in ["preview-dark", "preview-light", "preview-focus-dark",
                 "preview-settings-light", "preview-settings-dark",
                 "preview-composer-dark", "preview-context-dark"]:
        source_path = RAW / f"{name}.png"
        if not source_path.exists():
            continue
        source = Image.open(source_path)
        frame_individual(source).save(OUT / f"{name}.png")

    hero = make_hero()
    hero.save(OUT / "preview.png")
    print(f"Wrote {OUT / 'preview.png'} ({hero.width}x{hero.height})")
    print("Updated individual framed previews in docs/")


if __name__ == "__main__":
    main()
