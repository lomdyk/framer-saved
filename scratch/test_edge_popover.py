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
    # Use Microsoft Edge specifically!
    context = p.chromium.launch_persistent_context(
        user_data_dir=r"C:\Users\lomdy\.gemini\antigravity\scratch\browser_user_data_edge",
        headless=False,
        channel="msedge",
        args=[
            f"--disable-extensions-except={ext_path}",
            f"--load-extension={ext_path}",
        ]
    )
    page = context.new_page()
    page.set_viewport_size({"width": 1440, "height": 900})

    # Collect console logs
    console_logs = []
    page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))

    print("=== Navigating to Framer Marketplace (EDGE) ===")
    page.goto("https://www.framer.com/community/marketplace/components/", wait_until="domcontentloaded")
    time.sleep(4)

    btn_count = page.locator(".framer-saved-card-inline-btn").count()
    check(btn_count > 0, f"Bookmark buttons injected ({btn_count} found)")

    # ---------------------------------------------------------------
    # TEST 1: Open popover via card bookmark
    # ---------------------------------------------------------------
    print("\n=== TEST 1: Open popover ===")
    first_btn = page.locator(".framer-saved-card-inline-btn").first
    first_btn.click()
    time.sleep(1.5)

    popover = page.locator("#framer-saved-folder-popover")
    popover_visible = popover.count() > 0 and popover.is_visible()
    check(popover_visible, "Popover opened")
    page.screenshot(path=f"{screenshots}/edge_01_popover_open.png")

    if not popover_visible:
        print("FATAL: Popover never opened")
        context.close()
        sys.exit(1)

    # ---------------------------------------------------------------
    # TEST 2: Click INPUT field — popover must stay open
    # ---------------------------------------------------------------
    print("\n=== TEST 2: Click on input field ===")
    console_logs.clear()

    add_input = page.locator(".framer-saved-popover-input")
    if add_input.count() > 0:
        add_input.click()
        time.sleep(0.8)

        still_open = page.locator("#framer-saved-folder-popover").count() > 0
        check(still_open, "Popover stays open after clicking input")
        page.screenshot(path=f"{screenshots}/edge_02_after_input_click.png")

        # Print console logs to see if closeSavePopover was called
        for log in console_logs:
            if "framer-saved" in log.lower() or "popover" in log.lower() or "close" in log.lower():
                print(f"    CONSOLE: {log}")
    else:
        print("  ⚠️ Input not found")

    # ---------------------------------------------------------------
    # TEST 3: Click inside popover body
    # ---------------------------------------------------------------
    print("\n=== TEST 3: Click inside popover body ===")
    popover = page.locator("#framer-saved-folder-popover")
    if popover.count() > 0 and popover.is_visible():
        popover_box = popover.bounding_box()
        if popover_box:
            # Click at top-left area of popover (the header area)
            page.mouse.click(
                popover_box["x"] + 20,
                popover_box["y"] + 20
            )
            time.sleep(0.8)
            still_open = page.locator("#framer-saved-folder-popover").count() > 0
            check(still_open, "Popover stays open after clicking header area")
            page.screenshot(path=f"{screenshots}/edge_03_after_body_click.png")
    else:
        print("  ⚠️ Popover already closed before this test!")
        # Re-open for remaining tests
        first_btn.click()
        time.sleep(1.5)

    # ---------------------------------------------------------------
    # TEST 4: Click on popover title
    # ---------------------------------------------------------------
    print("\n=== TEST 4: Click popover title ===")
    popover = page.locator("#framer-saved-folder-popover")
    if popover.count() == 0:
        print("  ⚠️ Re-opening popover...")
        first_btn.click()
        time.sleep(1.5)

    title = page.locator(".framer-saved-popover-title")
    if title.count() > 0:
        title.click()
        time.sleep(0.8)
        still_open = page.locator("#framer-saved-folder-popover").count() > 0
        check(still_open, "Popover stays open after clicking title")

    # ---------------------------------------------------------------
    # TEST 5: Type in input and create folder
    # ---------------------------------------------------------------
    print("\n=== TEST 5: Create folder ===")
    popover = page.locator("#framer-saved-folder-popover")
    if popover.count() == 0:
        print("  ⚠️ Re-opening popover...")
        first_btn.click()
        time.sleep(1.5)

    add_input = page.locator(".framer-saved-popover-input")
    if add_input.count() > 0:
        add_input.fill("Тест Edge")
        time.sleep(0.3)
        add_input.press("Enter")
        time.sleep(1)
        still_open = page.locator("#framer-saved-folder-popover").count() > 0
        check(still_open, "Popover stays open after creating folder")
        page.screenshot(path=f"{screenshots}/edge_05_folder_created.png")

    # ---------------------------------------------------------------
    # TEST 6: Click Remove from Saved
    # ---------------------------------------------------------------
    print("\n=== TEST 6: Remove from Saved ===")
    popover = page.locator("#framer-saved-folder-popover")
    if popover.count() == 0:
        print("  ⚠️ Re-opening popover...")
        first_btn.click()
        time.sleep(1.5)

    remove_btn = page.locator(".framer-saved-popover-remove-btn")
    if remove_btn.count() > 0 and remove_btn.is_visible():
        remove_btn.click()
        time.sleep(1)
        popover_gone = page.locator("#framer-saved-folder-popover").count() == 0
        check(popover_gone, "Popover closed after Remove")
        first_btn_class = first_btn.get_attribute("class") or ""
        check("is-saved" not in first_btn_class, "Button no longer saved")
        page.screenshot(path=f"{screenshots}/edge_06_removed.png")

    # ---------------------------------------------------------------
    # TEST 7: Outside click closes popover
    # ---------------------------------------------------------------
    print("\n=== TEST 7: Outside click closes popover ===")
    first_btn.click()
    time.sleep(1.5)
    popover_open = page.locator("#framer-saved-folder-popover").count() > 0
    check(popover_open, "Re-opened popover")
    if popover_open:
        page.mouse.click(100, 100)
        time.sleep(0.8)
        popover_gone = page.locator("#framer-saved-folder-popover").count() == 0
        check(popover_gone, "Outside click closed popover")

    # ---------------------------------------------------------------
    # Print all relevant console logs
    # ---------------------------------------------------------------
    print("\n=== Console logs (filtered) ===")
    for log in console_logs:
        if any(kw in log.lower() for kw in ["framer-saved", "popover", "close", "outside", "contains"]):
            print(f"  {log}")

    print("\n" + "=" * 50)
    if FAIL:
        print("❌ SOME TESTS FAILED IN EDGE — SEE ABOVE")
    else:
        print("✅ ALL TESTS PASSED IN EDGE")
    print("=" * 50)

    context.close()
