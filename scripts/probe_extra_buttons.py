"""Capture extra-button HID reports from AI-style composite mice.

Opens every HID collection on the device except the pointer (so the cursor
keeps working). Prints press/release reports until Ctrl+C or timeout.
"""

from __future__ import annotations

import sys
import time
import threading
from typing import Any

import hid

# Standard desktop pointer — never claim it or the OS mouse dies.
MOUSE_USAGE_PAGE = 0x01
MOUSE_USAGE = 0x02

STOP = threading.Event()


def hex_bytes(data: bytes) -> str:
    return " ".join(f"{b:02X}" for b in data)


def is_mouse_pointer(dev: dict[str, Any]) -> bool:
    return dev.get("usage_page") == MOUSE_USAGE_PAGE and dev.get("usage") == MOUSE_USAGE


def device_label(dev: dict[str, Any]) -> str:
    vid = int(dev.get("vendor_id") or 0)
    pid = int(dev.get("product_id") or 0)
    up = int(dev.get("usage_page") or 0)
    us = int(dev.get("usage") or 0)
    iface = dev.get("interface_number")
    mfr = (dev.get("manufacturer_string") or "").strip()
    prod = (dev.get("product_string") or "").strip()
    name = " ".join(x for x in (mfr, prod) if x) or "HID"
    return f"{name} VID_{vid:04X}&PID_{pid:04X} MI_{iface} up={up:04X} us={us:04X}"


def find_ai_mice() -> list[dict[str, Any]]:
    all_devs = hid.enumerate()
    by_id: dict[tuple[int, int], list[dict[str, Any]]] = {}
    for d in all_devs:
        vid = int(d.get("vendor_id") or 0)
        pid = int(d.get("product_id") or 0)
        if vid == 0:
            continue
        by_id.setdefault((vid, pid), []).append(d)

    mice: list[dict[str, Any]] = []
    for (_vid, _pid), group in by_id.items():
        has_mouse = any(is_mouse_pointer(d) for d in group)
        extras = [d for d in group if not is_mouse_pointer(d)]
        if has_mouse and extras:
            mice.extend(extras)
    return mice


def reader_loop(dev_info: dict[str, Any]) -> None:
    label = device_label(dev_info)
    path = dev_info["path"]
    try:
        device = hid.Device(path=path)
        device.nonblocking = True
    except Exception as e:
        print(f"[FAIL] {label}  open error: {e}", flush=True)
        return

    print(f"[OPEN] {label}", flush=True)
    last = b""
    last_print = 0.0
    repeats = 0
    try:
        while not STOP.is_set():
            data = device.read(64)
            if not data:
                time.sleep(0.005)
                continue
            raw = bytes(data)
            now = time.time()
            if raw == last:
                repeats += 1
                if now - last_print < 0.25:
                    continue
                print(
                    f"{now:.3f}  REPEAT x{repeats}  {label}  {hex_bytes(raw)}",
                    flush=True,
                )
                last_print = now
                repeats = 0
                continue
            repeats = 0
            last = raw
            last_print = now
            kind = "RELEASE" if all(b == 0 for b in raw) else "REPORT"
            print(f"{now:.3f}  {kind:7}  {label}  {hex_bytes(raw)}", flush=True)
    except Exception as e:
        print(f"[ERR]  {label}  {e}", flush=True)
    finally:
        try:
            device.close()
        except Exception:
            pass
        print(f"[CLOSE] {label}", flush=True)


def main() -> int:
    timeout_s = float(sys.argv[1]) if len(sys.argv) > 1 else 90.0
    extras = find_ai_mice()
    if not extras:
        print("No composite AI-style mouse found (mouse + extra HID collections).")
        print("All HID devices:")
        for d in hid.enumerate():
            print(" ", device_label(d))
        return 1

    print("Listening on extra HID collections (mouse pointer left to Windows).")
    print("Click Translate, AI, Voice, OCR. Also try a hold and a double-click.")
    print(f"Timeout: {timeout_s:.0f}s. Ctrl+C to stop.\n", flush=True)

    threads = [
        threading.Thread(target=reader_loop, args=(d,), daemon=True) for d in extras
    ]
    for t in threads:
        t.start()

    try:
        STOP.wait(timeout_s)
    except KeyboardInterrupt:
        print("\nStopping…", flush=True)
    finally:
        STOP.set()
        time.sleep(0.2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
