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
        user_data_dir=r"C:\Users\lomdy\.gemini\antigravity\scratch\browser_user_data_edge_detail",
        headless=False,
        channel="msedge",
        args=[
            f"--disable-extensions-except={ext_path}",
            f"--load-extension={ext_path}",
        ]
    )
    page = context.new_page()
    page.set_viewport_size({"width": 1440, "height": 900})

    console_logs = []
    page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))

    # Go directly to a DETAIL PAGE (not marketplace grid!)
    print("=== Navigating to a DETAIL PAGE in Edge ===")
    page.goto("https://www.framer.com/community/marketplace/components/scroll-sequences/", wait_until="domcontentloaded")
    time.sleep(5)
    page.screenshot(path=f"{screenshots}/edge_detail_01_loaded.png")

    # Find the detail save button
    save_btn = page.locator(".framer-saved-detail-btn")
    btn_count = save_btn.count()
    check(btn_count > 0, f"Detail save button found ({btn_count})")

    if btn_count == 0:
        print("FATAL: No detail save button found. Extension may not be injecting on detail pages.")
        page.screenshot(path=f"{screenshots}/edge_detail_FATAL.png")
        context.close()
        sys.exit(1)

    # ---------------------------------------------------------------
    # TEST 1: Click detail save button → popover opens
    # ---------------------------------------------------------------
    print("\n=== TEST 1: Open popover on DETAIL page ===")
    save_btn.first.click()
    time.sleep(2)

    popover = page.locator("#framer-saved-folder-popover")
    popover_visible = popover.count() > 0 and popover.is_visible()
    check(popover_visible, "Popover opened on detail page")
    page.screenshot(path=f"{screenshots}/edge_detail_02_popover.png")

    if not popover_visible:
        print("FATAL: Popover didn't open on detail page")
        context.close()
        sys.exit(1)

    # ---------------------------------------------------------------
    # TEST 2: Click INPUT — does popover stay open?
    # ---------------------------------------------------------------
    print("\n=== TEST 2: Click input field on DETAIL page ===")
    console_logs.clear()
    
    add_input = page.locator(".framer-saved-popover-input")
    if add_input.count() > 0:
        # Use mouse.click on the input's bounding box (real desktop mouse click)
        input_box = add_input.bounding_box()
        if input_box:
            page.mouse.click(input_box["x"] + input_box["width"] / 2, input_box["y"] + input_box["height"] / 2)
            time.sleep(1)
            
            still_open = page.locator("#framer-saved-folder-popover").count() > 0
            check(still_open, "Popover stays open after mouse.click on input")
            page.screenshot(path=f"{screenshots}/edge_detail_03_after_input_click.png")
            
            if not still_open:
                print("  >>> BUG REPRODUCED! Popover closed after clicking input on DETAIL page!")
                # Print console logs
                for log in console_logs:
                    print(f"    CONSOLE: {log}")
        else:
            print("  ⚠️ Could not get input bounding box")
    else:
        print("  ⚠️ Input not found in popover")

    # Re-open if needed
    popover = page.locator("#framer-saved-folder-popover")
    if popover.count() == 0:
        print("  >>> Re-opening popover...")
        save_btn.first.click()
        time.sleep(2)

    # ---------------------------------------------------------------
    # TEST 3: Click popover BODY on detail page
    # ---------------------------------------------------------------
    print("\n=== TEST 3: Click popover body on DETAIL page ===")
    popover = page.locator("#framer-saved-folder-popover")
    if popover.count() > 0:
        box = popover.bounding_box()
        if box:
            page.mouse.click(box["x"] + 15, box["y"] + 15)
            time.sleep(1)
            still_open = page.locator("#framer-saved-folder-popover").count() > 0
            check(still_open, "Popover stays open after clicking body")
            page.screenshot(path=f"{screenshots}/edge_detail_04_body_click.png")
            
            if not still_open:
                print("  >>> BUG REPRODUCED! Popover closed after clicking body on DETAIL page!")

    # Re-open if needed
    popover = page.locator("#framer-saved-folder-popover")
    if popover.count() == 0:
        print("  >>> Re-opening popover...")
        save_btn.first.click()
        time.sleep(2)

    # ---------------------------------------------------------------
    # TEST 4: Click popover title on detail page
    # ---------------------------------------------------------------
    print("\n=== TEST 4: Click popover title on DETAIL page ===")
    title = page.locator(".framer-saved-popover-title")
    if title.count() > 0:
        title.click()
        time.sleep(1)
        still_open = page.locator("#framer-saved-folder-popover").count() > 0
        check(still_open, "Popover stays open after clicking title")
    
    # Re-open if needed
    if page.locator("#framer-saved-folder-popover").count() == 0:
        print("  >>> Re-opening popover...")
        save_btn.first.click()
        time.sleep(2)

    # ---------------------------------------------------------------
    # TEST 5: Create folder on detail page
    # ---------------------------------------------------------------
    print("\n=== TEST 5: Create folder on DETAIL page ===")
    add_input = page.locator(".framer-saved-popover-input")
    if add_input.count() > 0 and page.locator("#framer-saved-folder-popover").count() > 0:
        add_input.fill("Edge Тест")
        add_input.press("Enter")
        time.sleep(1.5)
        still_open = page.locator("#framer-saved-folder-popover").count() > 0
        check(still_open, "Popover stays open after creating folder")
        page.screenshot(path=f"{screenshots}/edge_detail_05_folder.png")

        if not still_open:
            print("  >>> BUG REPRODUCED! Popover closed after creating folder!")

    # Re-open if needed
    if page.locator("#framer-saved-folder-popover").count() == 0:
        print("  >>> Re-opening popover...")
        save_btn.first.click()
        time.sleep(2)

    # ---------------------------------------------------------------
    # TEST 6: Click on folder item
    # ---------------------------------------------------------------
    print("\n=== TEST 6: Click folder item on DETAIL page ===")
    folder_item = page.locator(".framer-saved-popover-item").first
    if folder_item.count() > 0:
        folder_item.click()
        time.sleep(1)
        still_open = page.locator("#framer-saved-folder-popover").count() > 0
        check(still_open, "Popover stays open after toggling folder item")
        page.screenshot(path=f"{screenshots}/edge_detail_06_toggled.png")

        if not still_open:
            print("  >>> BUG REPRODUCED! Popover closed after toggling folder!")

    # Re-open if needed
    if page.locator("#framer-saved-folder-popover").count() == 0:
        print("  >>> Re-opening popover...")
        save_btn.first.click()
        time.sleep(2)

    # ---------------------------------------------------------------
    # TEST 7: Remove from Saved
    # ---------------------------------------------------------------
    print("\n=== TEST 7: Remove from Saved on DETAIL page ===")
    remove_btn = page.locator(".framer-saved-popover-remove-btn")
    if remove_btn.count() > 0 and remove_btn.is_visible():
        remove_btn.click()
        time.sleep(1)
        popover_gone = page.locator("#framer-saved-folder-popover").count() == 0
        check(popover_gone, "Popover closed after Remove")
        page.screenshot(path=f"{screenshots}/edge_detail_07_removed.png")

    # ---------------------------------------------------------------
    # Print all console logs
    # ---------------------------------------------------------------
    print("\n=== ALL console logs ===")
    for log in console_logs:
        print(f"  {log}")

    print("\n" + "=" * 50)
    if FAIL:
        print("❌ SOME TESTS FAILED ON DETAIL PAGE IN EDGE")
    else:
        print("✅ ALL TESTS PASSED ON DETAIL PAGE IN EDGE")
    print("=" * 50)

    context.close()
