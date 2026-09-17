"""Two-phase HID diff: idle baseline vs extra-button mash."""

from __future__ import annotations

import collections
import sys
import threading
import time

import hid

STOP = threading.Event()
LOCK = threading.Lock()
COUNTS: dict[str, collections.Counter[str]] = {
    "idle": collections.Counter(),
    "press": collections.Counter(),
}
phase = "idle"


def classify(raw: bytes, iface: int, up: int) -> str:
    if not raw:
        return f"mi{iface}:empty"
    if len(raw) >= 2 and raw[0] == 0x0A and raw[1] == 0x9C:
        return f"mi{iface}:audio"
    if len(raw) >= 6 and raw[0] == 0x0A and raw[1] == 0x26:
        return f"mi{iface}:st26:b5={raw[5]:02X}"
    head = raw[:8].hex()
    zeros = raw[-12:].count(0) if len(raw) >= 12 else 0
    return f"mi{iface}:up{up:04X}:n{len(raw)}:z{zeros}:{head}"


def reader(dev_info: dict) -> None:
    iface = int(dev_info.get("interface_number") or 0)
    up = int(dev_info.get("usage_page") or 0)
    us = int(dev_info.get("usage") or 0)
    if up == 0x01 and us == 0x02:
        return
    try:
        device = hid.Device(path=dev_info["path"])
        device.nonblocking = True
    except Exception as e:
        print(f"OPEN FAIL MI_{iface} up={up:04X} {e}", flush=True)
        return
    print(f"OPEN MI_{iface} up={up:04X} us={us:04X}", flush=True)
    last = b""
    try:
        while not STOP.is_set():
            data = device.read(128)
            if not data:
                time.sleep(0.003)
                continue
            raw = bytes(data)
            if raw == last:
                continue
            last = raw
            key = classify(raw, iface, up)
            with LOCK:
                COUNTS[phase][key] += 1
    except Exception as e:
        print(f"READ FAIL MI_{iface} {e}", flush=True)
    finally:
        try:
            device.close()
        except Exception:
            pass


def top(counter: collections.Counter[str], n: int = 20) -> None:
    if not counter:
        print("  (none)", flush=True)
        return
    for key, c in counter.most_common(n):
        print(f"  {c:6d}  {key}", flush=True)


def main() -> int:
    global phase
    idle_s = 5.0
    press_s = 12.0
    for d in hid.enumerate():
        if int(d.get("vendor_id") or 0) != 0x248A:
            continue
        threading.Thread(target=reader, args=(d,), daemon=True).start()
    time.sleep(0.5)
    print(f"\n=== IDLE {idle_s:.0f}s: do NOT press extra buttons ===", flush=True)
    time.sleep(idle_s)
    with LOCK:
        idle_copy = collections.Counter(COUNTS["idle"])
        phase = "press"
    print("\n>>> PRESS ALL 4 EXTRA BUTTONS NOW (Translate, AI, Voice, OCR) <<<", flush=True)
    print("    Click each a few times. You have 12 seconds.\n", flush=True)
    time.sleep(press_s)
    STOP.set()
    time.sleep(0.2)
    with LOCK:
        press_copy = collections.Counter(COUNTS["press"])
    new_keys = [k for k in press_copy if k not in idle_copy]
    print("IDLE top:", flush=True)
    top(idle_copy)
    print("\nPRESS top:", flush=True)
    top(press_copy)
    print("\nNEW during press (not seen in idle):", flush=True)
    if not new_keys:
        print("  NONE", flush=True)
        return 2
    for k in sorted(new_keys, key=lambda x: -press_copy[x]):
        print(f"  {press_copy[k]:6d}  {k}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
