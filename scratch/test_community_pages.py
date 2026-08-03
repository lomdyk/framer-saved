import sys
import time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ext_path = r"C:\Users\lomdy\.gemini\antigravity\scratch\framer-saved-extension"
screenshots = r"C:\Users\lomdy\.gemini\antigravity\scratch\framer-saved-extension\assets"
FAIL = False

def check(condition, label):
    global FAIL
    if condition:
        print(f"  ✅ {label}")
    else:
        print(f"  ❌ FAIL: {label}")
        FAIL = True

with sync_playwright() as p:
    context = p.chromium.launch_persistent_context(
        user_data_dir=r"C:\Users\lomdy\.gemini\antigravity\scratch\browser_user_data_community",
        headless=False,
        channel="msedge",
        args=[
            f"--disable-extensions-except={ext_path}",
            f"--load-extension={ext_path}",
        ]
    )
    page = context.new_page()
    page.set_viewport_size({"width": 1440, "height": 900})

    # Test 1: /community/search/?q=nav
    print("=== TEST 1: Community Search page ===")
    page.goto("https://www.framer.com/community/search/?q=nav", wait_until="domcontentloaded")
    time.sleep(5)
    btns = page.locator(".framer-saved-card-inline-btn").count()
    check(btns > 0, f"Bookmark buttons on /community/search/ ({btns} found)")
    page.screenshot(path=f"{screenshots}/community_search.png")

    # Test 2: /community/gallery/
    print("\n=== TEST 2: Community Gallery page ===")
    page.goto("https://www.framer.com/community/gallery/", wait_until="domcontentloaded")
    time.sleep(5)
    btns2 = page.locator(".framer-saved-card-inline-btn").count()
    # Gallery might not have marketplace cards, but it shouldn't crash
    print(f"  ℹ️ Bookmark buttons on /community/gallery/: {btns2}")
    page.screenshot(path=f"{screenshots}/community_gallery.png")

    # Test 3: /community/ (main)
    print("\n=== TEST 3: Community main page ===")
    page.goto("https://www.framer.com/community/", wait_until="domcontentloaded")
    time.sleep(5)
    btns3 = page.locator(".framer-saved-card-inline-btn").count()
    print(f"  ℹ️ Bookmark buttons on /community/: {btns3}")
    page.screenshot(path=f"{screenshots}/community_main.png")

    # Test 4: Search with different query
    print("\n=== TEST 4: Community Search for 'button' ===")
    page.goto("https://www.framer.com/community/search/?q=button", wait_until="domcontentloaded")
    time.sleep(5)
    btns4 = page.locator(".framer-saved-card-inline-btn").count()
    check(btns4 > 0, f"Bookmark buttons on /community/search/?q=button ({btns4} found)")
    page.screenshot(path=f"{screenshots}/community_search_button.png")

    # Test 5: Click bookmark on search page → popover works
    if btns4 > 0:
        print("\n=== TEST 5: Popover on search page ===")
        first_btn = page.locator(".framer-saved-card-inline-btn").first
        first_btn.click()
        time.sleep(1.5)
        popover = page.locator("#framer-saved-folder-popover")
        check(popover.count() > 0 and popover.is_visible(), "Popover opened on search page")
        page.screenshot(path=f"{screenshots}/community_search_popover.png")

        # Close popover
        page.mouse.click(100, 100)
        time.sleep(0.5)

    print("\n" + "=" * 50)
    if FAIL:
        print("❌ SOME TESTS FAILED")
    else:
        print("✅ ALL COMMUNITY PAGE TESTS PASSED")
    print("=" * 50)

    context.close()
