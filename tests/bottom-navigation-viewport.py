#!/usr/bin/env python3
"""Automated responsive checks for Pem's Bottom Navigation.

Run with:
    python3 tests/bottom-navigation-viewport.py

The test uses Playwright's Python API and the system Chromium binary. Set
CHROMIUM_PATH to override the browser executable when needed.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright
except ImportError as exc:  # pragma: no cover - environment setup failure
    raise SystemExit(
        "Playwright Python package is required. Install it with: "
        "python3 -m pip install playwright && python3 -m playwright install chromium"
    ) from exc

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "http://127.0.0.1:4173/"
VIEWPORTS = [
    ("320x568", 320, 568),
    ("360x640", 360, 640),
    ("375x667", 375, 667),
    ("390x844", 390, 844),
    ("412x915", 412, 915),
    ("480x800", 480, 800),
    ("568x320-landscape", 568, 320),
    ("667x375-landscape", 667, 375),
]


def wait_for_server(url: str, timeout_seconds: float = 10) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=0.5) as response:
                return response.status == 200
        except Exception:
            time.sleep(0.15)
    return False


def px(value: str) -> float:
    return float(value.replace("px", "").strip() or 0)


def run_browser_audit() -> list[dict]:
    executable = os.environ.get("CHROMIUM_PATH") or shutil.which("chromium") or shutil.which("google-chrome")
    launch_options = {"headless": True, "args": ["--no-sandbox"]}
    if executable:
        launch_options["executable_path"] = executable

    results: list[dict] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**launch_options)
        for name, width, height in VIEWPORTS:
            page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
            page.goto(BASE_URL, wait_until="networkidle")
            measured = page.evaluate(
                """
                () => {
                  const nav = document.querySelector('.bottom-nav');
                  const capture = document.querySelector('.capture-nav');
                  const navRect = nav.getBoundingClientRect();
                  const captureRect = capture.getBoundingClientRect();
                  const pseudo = getComputedStyle(nav, '::before');
                  const items = [...document.querySelectorAll('.nav-item')].map(item => {
                    const rect = item.getBoundingClientRect();
                    return { width: rect.width, height: rect.height, label: item.innerText.trim() };
                  });
                  return {
                    nav: { width: navRect.width, height: navRect.height, top: navRect.top, bottom: navRect.bottom },
                    capture: { width: captureRect.width, height: captureRect.height, top: captureRect.top, bottom: captureRect.bottom, lift: navRect.top - captureRect.top },
                    notch: { width: pseudo.width, height: pseudo.height },
                    items,
                    bodyPaddingBottom: getComputedStyle(document.body).paddingBottom,
                    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
                  };
                }
                """
            )

            failures: list[str] = []
            if not 71 <= measured["nav"]["height"] <= 73:
                failures.append(f"nav height={measured['nav']['height']:.1f}px, expected 72px")
            if not 64 <= measured["capture"]["width"] <= 68 or not 64 <= measured["capture"]["height"] <= 68:
                failures.append("capture button is outside 64–68px")
            if not 24 <= measured["capture"]["lift"] <= 28:
                failures.append(f"capture lift={measured['capture']['lift']:.1f}px, expected 24–28px")
            if not 84 <= px(measured["notch"]["width"]) <= 92:
                failures.append(f"notch width={measured['notch']['width']}, expected 84–92px")
            if px(measured["bodyPaddingBottom"]) < 110:
                failures.append(f"body padding-bottom={measured['bodyPaddingBottom']}, expected >=110px")
            if measured["horizontalOverflow"]:
                failures.append("horizontal overflow detected")
            for item in measured["items"]:
                if item["label"] != "ถ่ายใบชั่ง" and (item["width"] < 48 or item["height"] < 48):
                    failures.append(f"nav item {item['label']!r} is smaller than 48px")

            for view_name in ("dashboard", "history"):
                page.locator(f'.nav-item[data-view="{view_name}"]').click()
                if not page.locator(f"#view-{view_name}").evaluate("node => node.classList.contains('active')"):
                    failures.append(f"{view_name} navigation did not activate its view")

            try:
                with page.expect_file_chooser(timeout=3000):
                    page.locator(".capture-nav").click()
            except PlaywrightTimeoutError:
                failures.append("capture navigation did not open file chooser")
            if not page.locator("#view-home").evaluate("node => node.classList.contains('active')"):
                failures.append("capture navigation did not return to home view")

            page.evaluate(
                """
                () => {
                  showView('history');
                  const list = document.querySelector('#history-list');
                  list.classList.remove('empty');
                  list.innerHTML = Array.from({ length: 18 }, (_, index) =>
                    `<article class="history-card synthetic-card" style="min-height:96px"><div class="history-main"><div><h3>รายการทดสอบ ${index + 1}</h3><p>ใบชั่งจำลอง</p></div></div></article>`
                  ).join('');
                  document.documentElement.style.scrollBehavior = 'auto';
                  window.scrollTo(0, document.documentElement.scrollHeight);
                }
                """
            )
            page.wait_for_timeout(50)
            clearance = page.evaluate(
                """
                () => {
                  const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
                  const last = document.querySelector('#history-list .synthetic-card:last-child').getBoundingClientRect();
                  return { clearance: nav.top - last.bottom, visible: last.bottom <= nav.top };
                }
                """
            )
            if not clearance["visible"] or clearance["clearance"] < 0:
                failures.append(f"last history item is covered by navigation ({clearance['clearance']:.1f}px)")

            results.append({"viewport": name, "status": "PASS" if not failures else "FAIL", "failures": failures})
            page.close()
        browser.close()
    return results


def main() -> int:
    server = None
    try:
        if not wait_for_server(BASE_URL, timeout_seconds=0.5):
            server = subprocess.Popen(
                ["npm", "run", "dev", "--", "--host", "127.0.0.1"],
                cwd=ROOT,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if not wait_for_server(BASE_URL):
                print("Unable to start Pem dev server", file=sys.stderr)
                return 2
        results = run_browser_audit()
    finally:
        if server is not None:
            server.terminate()
            server.wait(timeout=5)

    print(json.dumps(results, ensure_ascii=False, indent=2))
    failed = [result for result in results if result["status"] == "FAIL"]
    if failed:
        print(f"\nBottom Navigation audit failed in {len(failed)} viewport(s).", file=sys.stderr)
        return 1
    print(f"\nBottom Navigation audit passed in {len(results)} viewport(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
