#!/usr/bin/env python3
"""Capture Outing web screens at iPhone size and composite GitHub README art.

Prerequisites: Pillow + Playwright Chromium, and Expo web on :8081.

    cd apps/mobile && BROWSER=none npx expo start --web --port 8081
    python3 scripts/capture-readme-screenshots.py
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "screenshots"
BASE_URL = os.environ.get("OUTING_WEB_URL", "http://127.0.0.1:8081")
PHONE_W, PHONE_H = 390, 844
SCALE = 2
INK = (26, 22, 17, 255)
PARCHMENT = (253, 250, 246, 255)
CORAL = (217, 85, 58, 255)

QUIZ_ANSWERS = {
    "originAirport": "SFO",
    "travelRanges": ["short_flight", "long_domestic", "international"],
    "travelScope": "either",
    "transportModes": ["plane", "train"],
    "months": [5, 6, 7, 9, 10],
    "duration": 7,
    "groupType": "couple",
    "groupSize": 2,
    "glamourLevel": "comfortably_fabulous",
    "interests": ["food", "nightlife", "culture", "beach", "pride"],
    "socialPrefs": ["community", "exploration"],
    "activityPace": "balanced",
    "dayRhythm": "flexible",
    "tripGoals": ["explore", "celebrate", "indulge"],
    "vacationStyles": ["local_neighborhoods", "iconic_highlights"],
    "mealPreferences": [],
    "avoidances": [],
    "hallmarkIds": [],
    "hallmarkNames": [],
    "customEssentials": [],
    "freeformWish": "Warm weather, memorable meals, and a visible queer scene.",
    "lodgingStatus": "none",
    "lodgingAddress": "",
}


def wait_for_server(url: str, timeout_s: int = 180) -> None:
    deadline = time.time() + timeout_s
    last_error = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if response.status < 500:
                    return
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            last_error = error
            time.sleep(2)
    raise RuntimeError(f"Expo web did not become ready at {url}: {last_error}")


def hide_dev_overlays(page) -> None:
    page.add_style_tag(
        content="""
        [data-testid="dev-menu"], #dev-menu, .css-dev-menu { display: none !important; }
        body { background: #FDFAF6 !important; }
        """
    )


def dismiss_dev_overlays(page) -> None:
    for _ in range(5):
        button = page.get_by_text("Dismiss", exact=True)
        if button.count() == 0:
            break
        try:
            if button.first.is_visible():
                button.first.click(timeout=1_000)
                page.wait_for_timeout(250)
            else:
                break
        except Exception:
            break


def settle(page, extra_ms: int = 900) -> None:
    page.wait_for_timeout(extra_ms)
    try:
        page.wait_for_load_state("networkidle", timeout=12_000)
    except Exception:
        pass
    dismiss_dev_overlays(page)
    page.wait_for_timeout(600)


def capture(page, path: Path) -> None:
    hide_dev_overlays(page)
    settle(page)
    path.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(path), type="png", animations="disabled")
    print(f"captured {path.relative_to(ROOT)}")


def round_corners(image: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, image.width, image.height), radius=radius, fill=255)
    out = image.convert("RGBA")
    out.putalpha(mask)
    return out


def phone_frame(screenshot: Image.Image) -> Image.Image:
    bezel = 18
    top = 28
    bottom = 28
    radius = 56
    framed_w = screenshot.width + bezel * 2
    framed_h = screenshot.height + top + bottom
    canvas = Image.new("RGBA", (framed_w, framed_h), (0, 0, 0, 0))
    shell = Image.new("RGBA", (framed_w, framed_h), INK)
    shell = round_corners(shell, radius)
    canvas.alpha_composite(shell)
    screen = round_corners(screenshot.convert("RGBA"), 42)
    canvas.alpha_composite(screen, (bezel, top))
    draw = ImageDraw.Draw(canvas)
    pill_w, pill_h = 168, 22
    pill_x = (framed_w - pill_w) // 2
    draw.rounded_rectangle(
        (pill_x, 12, pill_x + pill_w, 12 + pill_h),
        radius=11,
        fill=(15, 13, 10, 255),
    )
    return canvas


def drop_shadow(image: Image.Image, pad: int = 48) -> Image.Image:
    canvas = Image.new("RGBA", (image.width + pad * 2, image.height + pad * 2), (0, 0, 0, 0))
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 90), (pad + 8, pad + 18, pad + image.width + 8, pad + image.height + 18))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(image, (pad, pad))
    return canvas


def compose_hero(frames: list[Image.Image], dest: Path) -> None:
    gap = 48
    framed = [drop_shadow(phone_frame(frame)) for frame in frames]
    height = max(image.height for image in framed)
    width = sum(image.width for image in framed) + gap * (len(framed) - 1) + 80
    hero = Image.new("RGBA", (width, height + 40), PARCHMENT)
    x = 40
    for image in framed:
        y = 20 + (height - image.height) // 2
        hero.alpha_composite(image, (x, y))
        x += image.width + gap
    hero.convert("RGB").save(dest, "JPEG", quality=86, optimize=True, progressive=True)
    print(f"wrote {dest.relative_to(ROOT)}")


PHOTO_SHOTS = {"home", "discover", "destination", "collection"}


def export_framed(screenshot_path: Path, dest: Path) -> None:
    shot = Image.open(screenshot_path).convert("RGBA")
    framed = drop_shadow(phone_frame(shot))
    background = Image.new("RGB", framed.size, PARCHMENT[:3])
    background.paste(framed, mask=framed.split()[-1])
    if dest.suffix.lower() in {".jpg", ".jpeg"}:
        background.save(dest, "JPEG", quality=86, optimize=True, progressive=True)
    else:
        background.save(dest, "PNG", optimize=True)
    print(f"wrote {dest.relative_to(ROOT)}")


def main() -> None:
    wait_for_server(BASE_URL)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    answers = json.dumps(QUIZ_ANSWERS, separators=(",", ":"))

    shots = {
        "welcome": "/welcome",
        "home": "/",
        "discover": "/discover",
        "destination": "/destinations/san-francisco",
        "collection": "/collections/queer-history",
        "quiz": "/quiz",
        "quiz-results": f"/quiz/results?answers={urllib.parse.quote(answers)}",
        "trips": "/trips",
        "trips-new": "/trips/new",
        "ask": "/ask",
        "profile": "/profile",
        "login": "/auth/login",
        "settings": "/settings",
        "inspiration": "/inspiration",
    }

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(
            viewport={"width": PHONE_W, "height": PHONE_H},
            device_scale_factor=SCALE,
            color_scheme="light",
            is_mobile=True,
            has_touch=True,
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            ),
        )
        page = context.new_page()
        page.emulate_media(color_scheme="light")

        # Warm the origin so localStorage writes stick for Expo Router.
        page.goto(BASE_URL, wait_until="domcontentloaded", timeout=120_000)
        settle(page, 1500)

        for name, path in shots.items():
            onboarding = "false" if name == "welcome" else "true"
            page.add_init_script(
                f"""
                try {{
                  localStorage.setItem('outing:onboarding:v1:complete', '{onboarding}');
                  localStorage.setItem('outing:appearance', 'light');
                }} catch (error) {{}}
                """
            )
            page.evaluate(
                """([onboarding]) => {
                  localStorage.setItem('outing:onboarding:v1:complete', onboarding);
                  localStorage.setItem('outing:appearance', 'light');
                }""",
                [onboarding],
            )
            page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded", timeout=120_000)
            if name == "welcome":
                # Stay on the first introduction card.
                page.wait_for_selector("text=Find the place that fits.", timeout=30_000)
            elif name == "quiz":
                page.wait_for_selector("text=Where are you starting from?", timeout=30_000)
            elif name == "quiz-results":
                page.wait_for_selector("text=Your matches", timeout=30_000)
            elif name == "destination":
                page.wait_for_selector("text=San Francisco", timeout=30_000)
            elif name == "collection":
                page.wait_for_selector("text=Queer history", timeout=30_000)
            elif name == "trips-new":
                page.wait_for_selector("text=Help me choose a destination", timeout=30_000)
            elif name == "ask":
                page.wait_for_selector("text=Ask Outing", timeout=30_000)
            elif name == "login":
                page.wait_for_selector("text=Sign in to save trips", timeout=30_000)
            elif name == "settings":
                page.wait_for_selector("text=Settings", timeout=30_000)
            elif name == "inspiration":
                page.wait_for_selector("text=Inspiration", timeout=30_000)
            elif name == "profile":
                page.wait_for_selector("text=You", timeout=30_000)
            elif name == "home":
                page.wait_for_selector("text=What are we getting into?", timeout=30_000)
            elif name == "discover":
                page.wait_for_selector("text=Discover", timeout=30_000)
            elif name == "trips":
                page.wait_for_selector("text=Your next Outing starts here.", timeout=30_000)
            settle(page, 1800)
            if page.get_by_text("Uncaught Error", exact=True).count():
                raise RuntimeError(f"{name} still shows an Expo error overlay")
            capture(page, OUT_DIR / f"{name}-raw.png")

        browser.close()

    for name in shots:
        suffix = ".jpg" if name in PHOTO_SHOTS else ".png"
        export_framed(OUT_DIR / f"{name}-raw.png", OUT_DIR / f"{name}{suffix}")

    compose_hero(
        [
            Image.open(OUT_DIR / "welcome-raw.png"),
            Image.open(OUT_DIR / "home-raw.png"),
            Image.open(OUT_DIR / "discover-raw.png"),
        ],
        OUT_DIR / "hero.jpg",
    )
    compose_hero(
        [
            Image.open(OUT_DIR / "destination-raw.png"),
            Image.open(OUT_DIR / "quiz-raw.png"),
            Image.open(OUT_DIR / "trips-raw.png"),
        ],
        OUT_DIR / "hero-plan.jpg",
    )


if __name__ == "__main__":
    main()
