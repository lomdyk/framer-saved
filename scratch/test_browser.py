import sys
import time
from playwright.sync_api import sync_playwright

ext_path = r"C:\Users\lomdy\.gemini\antigravity\scratch\framer-saved-extension"

with sync_playwright() as p:
    context = p.chromium.launch_persistent_context(
        user_data_dir=r"C:\Users\lomdy\.gemini\antigravity\scratch\browser_user_data",
        headless=False,
        args=[
            f"--disable-extensions-except={ext_path}",
            f"--load-extension={ext_path}",
        ]
    )
    page = context.new_page()
    page.goto("https://www.framer.com/community/marketplace/components/", wait_until="networkidle")
    print("Page loaded successfully!", page.title())
    page.screenshot(path=r"C:\Users\lomdy\.gemini\antigravity\scratch\framer-saved-extension\assets\browser_test.png")
    time.sleep(5)
    context.close()
