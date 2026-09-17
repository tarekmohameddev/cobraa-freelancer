"""Debug helper: list extra-button HID collections (no hardcoded Windows path)."""

import hid

TARGET_VID = 0x248A

print("HID collections for AI-style mice (VID_248A / extras on any composite mouse):\n")
for d in hid.enumerate():
    vid = int(d.get("vendor_id") or 0)
    pid = int(d.get("product_id") or 0)
    up = int(d.get("usage_page") or 0)
    us = int(d.get("usage") or 0)
    iface = d.get("interface_number")
    mfr = d.get("manufacturer_string") or ""
    prod = d.get("product_string") or ""
    if vid != TARGET_VID:
        continue
    kind = "POINTER" if (up == 0x01 and us == 0x02) else "EXTRA"
    print(f"{kind:8} VID_{vid:04X}&PID_{pid:04X} MI_{iface} up={up:04X} us={us:04X}  {mfr} {prod}")
    print(f"         {d.get('path')}\n")

print("Use scripts/mouse_button_daemon.py (started by the Electron app) instead of opening a fixed path.")
print("The old TARGET_PATH broke because Windows changes the instance ID after unplug/replug.")
