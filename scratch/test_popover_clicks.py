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
        user_data_dir=r"C:\Users\lomdy\.gemini\antigravity\scratch\browser_user_data_v2",
        headless=False,
        args=[
            f"--disable-extensions-except={ext_path}",
            f"--load-extension={ext_path}",
        ]
    )
    page = context.new_page()
    page.set_viewport_size({"width": 1440, "height": 900})

    print("=== Navigating to Framer Marketplace ===")
    page.goto("https://www.framer.com/community/marketplace/components/", wait_until="domcontentloaded")
    time.sleep(4)

    btn_count = page.locator(".framer-saved-card-inline-btn").count()
    check(btn_count > 0, f"Bookmark buttons injected ({btn_count} found)")
    page.screenshot(path=f"{screenshots}/debug_01_loaded.png")

    # ---------------------------------------------------------------
    # TEST 1: Click bookmark → popover opens
    # ---------------------------------------------------------------
    print("\n=== TEST 1: Open popover via card bookmark button ===")
    first_btn = page.locator(".framer-saved-card-inline-btn").first
    first_btn.click()
    time.sleep(1.5)

    popover = page.locator("#framer-saved-folder-popover")
    popover_visible = popover.count() > 0 and popover.is_visible()
    check(popover_visible, "Popover opened after bookmark click")
    page.screenshot(path=f"{screenshots}/debug_02_popover_open.png")

    if not popover_visible:
        print("FATAL: Popover never opened, cannot continue tests.")
        context.close()
        sys.exit(1)

    # ---------------------------------------------------------------
    # TEST 2: Click INSIDE popover body → popover stays open
    # ---------------------------------------------------------------
    print("\n=== TEST 2: Click inside popover body (not on any button) ===")
    popover_box = popover.bounding_box()
    if popover_box:
        # Click in the middle of the popover body
        page.mouse.click(
            popover_box["x"] + popover_box["width"] / 2,
            popover_box["y"] + popover_box["height"] / 2
        )
        time.sleep(0.5)
        still_open = popover.count() > 0 and popover.is_visible()
        check(still_open, "Popover stays open after clicking inside its body")
        page.screenshot(path=f"{screenshots}/debug_03_click_inside_body.png")
    else:
        print("  ⚠️ Could not get popover bounding box")

    # ---------------------------------------------------------------
    # TEST 3: Click on popover header text → popover stays open
    # ---------------------------------------------------------------
    print("\n=== TEST 3: Click on popover title text ===")
    title = page.locator(".framer-saved-popover-title")
    if title.count() > 0:
        title.click()
        time.sleep(0.5)
        still_open = popover.count() > 0 and popover.is_visible()
        check(still_open, "Popover stays open after clicking title text")
    else:
        print("  ⚠️ No title element found")

    # ---------------------------------------------------------------
    # TEST 4: Type in folder input → popover stays open
    # ---------------------------------------------------------------
    print("\n=== TEST 4: Type in folder input field ===")
    add_input = page.locator(".framer-saved-popover-input")
    if add_input.count() > 0:
        add_input.click()
        time.sleep(0.3)
        still_open = popover.count() > 0 and popover.is_visible()
        check(still_open, "Popover stays open after clicking input field")

        add_input.fill("Тестовая Папка")
        time.sleep(0.3)
        still_open = popover.count() > 0 and popover.is_visible()
        check(still_open, "Popover stays open after typing in input")
        page.screenshot(path=f"{screenshots}/debug_04_input_typed.png")
    else:
        print("  ⚠️ No input field found")

    # ---------------------------------------------------------------
    # TEST 5: Press Enter to create folder → popover stays open
    # ---------------------------------------------------------------
    print("\n=== TEST 5: Create folder via Enter → popover stays open ===")
    if add_input.count() > 0:
        add_input.press("Enter")
        time.sleep(1)
        still_open = popover.count() > 0 and popover.is_visible()
        check(still_open, "Popover stays open after creating folder")
        page.screenshot(path=f"{screenshots}/debug_05_folder_created.png")

        # Check the folder item appeared
        folder_items = page.locator(".framer-saved-popover-item")
        check(folder_items.count() > 0, f"Folder item appeared in popover ({folder_items.count()} items)")

    # ---------------------------------------------------------------
    # TEST 6: Click on folder item (toggle) → popover stays open
    # ---------------------------------------------------------------
    print("\n=== TEST 6: Click folder item to toggle → popover stays open ===")
    folder_item = page.locator(".framer-saved-popover-item").first
    if folder_item.count() > 0:
        folder_item.click()
        time.sleep(1)
        still_open = popover.count() > 0 and popover.is_visible()
        check(still_open, "Popover stays open after toggling folder item")
        page.screenshot(path=f"{screenshots}/debug_06_folder_toggled.png")
    else:
        print("  ⚠️ No folder items found")

    # ---------------------------------------------------------------
    # TEST 7: Click "Remove from Saved" → popover closes, item unsaved
    # ---------------------------------------------------------------
    print("\n=== TEST 7: Click 'Remove from Saved' button ===")
    remove_btn = page.locator(".framer-saved-popover-remove-btn")
    if remove_btn.count() > 0 and remove_btn.is_visible():
        remove_btn.click()
        time.sleep(1)
        popover_gone = popover.count() == 0 or not popover.is_visible()
        check(popover_gone, "Popover closed after 'Remove from Saved' click")

        # Check the first bookmark button is no longer blue
        first_btn_class = first_btn.get_attribute("class") or ""
        check("is-saved" not in first_btn_class, "Bookmark button no longer has 'is-saved' class")
        page.screenshot(path=f"{screenshots}/debug_07_removed.png")
    else:
        print("  ⚠️ Remove button not found or not visible")
        page.screenshot(path=f"{screenshots}/debug_07_remove_btn_missing.png")

    # ---------------------------------------------------------------
    # TEST 8: Re-save, open popover, click OUTSIDE → popover closes
    # ---------------------------------------------------------------
    print("\n=== TEST 8: Click outside popover → popover closes ===")
    first_btn.click()
    time.sleep(1.5)
    popover_visible = popover.count() > 0 and popover.is_visible()
    check(popover_visible, "Re-opened popover for outside-click test")

    if popover_visible:
        # Click far away from popover
        page.mouse.click(100, 100)
        time.sleep(0.5)
        popover_gone = popover.count() == 0 or not popover.is_visible()
        check(popover_gone, "Popover closed after clicking outside")
        page.screenshot(path=f"{screenshots}/debug_08_outside_click.png")

    # ---------------------------------------------------------------
    # Summary
    # ---------------------------------------------------------------
    print("\n" + "=" * 50)
    if FAIL:
        print("❌ SOME TESTS FAILED — SEE ABOVE")
    else:
        print("✅ ALL TESTS PASSED")
    print("=" * 50)

    context.close()
