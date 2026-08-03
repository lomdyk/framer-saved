import sys
import time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

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
    print("Navigating to Framer Marketplace...")
    page.goto("https://www.framer.com/community/marketplace/components/", wait_until="domcontentloaded")
    time.sleep(3)

    # 1. Take initial screenshot of marketplace with injected bookmark buttons
    page.screenshot(path=r"C:\Users\lomdy\.gemini\antigravity\scratch\framer-saved-extension\assets\step1_marketplace.png")
    print("Step 1: Marketplace loaded.")

    # 2. Click the bookmark button on the first card
    btn = page.locator(".framer-saved-card-inline-btn").first
    print("Bookmark buttons count:", page.locator(".framer-saved-card-inline-btn").count())

    if btn.count() > 0:
        btn.click()
        time.sleep(1.5)
        page.screenshot(path=r"C:\Users\lomdy\.gemini\antigravity\scratch\framer-saved-extension\assets\step2_popover.png")
        print("Step 2: Save popover opened.")

        # 3. Create a Cyrillic folder
        add_input = page.locator(".framer-saved-popover-input")
        if add_input.count() > 0:
            add_input.fill("Мои Компоненты")
            add_input.press("Enter")
            time.sleep(1)
            page.screenshot(path=r"C:\Users\lomdy\.gemini\antigravity\scratch\framer-saved-extension\assets\step3_cyrillic_folder_created.png")
            print("Step 3: Cyrillic folder 'Мои Компоненты' created.")

        # 4. Remove from saved via popover
        remove_btn = page.locator(".framer-saved-popover-remove-btn")
        if remove_btn.count() > 0:
            remove_btn.click()
            time.sleep(1)
            page.screenshot(path=r"C:\Users\lomdy\.gemini\antigravity\scratch\framer-saved-extension\assets\step4_removed_state.png")
            print("Step 4: Removed from saved via popover.")

    # 5. Click on an actual component card detail link to test navigation
    detail_links = page.locator("a[href*='/marketplace/components/']")
    count = detail_links.count()
    print("Found detail links count:", count)

    target_link = None
    for i in range(count):
        href = detail_links.nth(i).get_attribute("href") or ""
        if any(bad in href for bad in ["/featured", "/categories", "/tags", "/collections", "/search"]):
            continue
        if href.count("/") >= 4 and not href.endswith("/components/") and not href.endswith("/components"):
            target_link = detail_links.nth(i)
            print(f"Found component card link [{i}]: {href}")
            break

    if target_link:
        print("Clicking component card link...")
        target_link.click()
        time.sleep(4)
        print("Current page URL after component card click:", page.url)
        page.screenshot(path=r"C:\Users\lomdy\.gemini\antigravity\scratch\framer-saved-extension\assets\step5_detail_page_navigation.png")
        print("Step 5: Card navigation test completed successfully!")

    context.close()
