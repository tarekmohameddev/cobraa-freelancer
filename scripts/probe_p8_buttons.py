"""Probe official P8-HIDRAWDATA extra-button frames on FF03."""

from __future__ import annotations

import sys
import time

import hid


def open_ff03():
    for d in hid.enumerate():
        if int(d.get("vendor_id") or 0) != 0x248A:
            continue
        if int(d.get("usage_page") or 0) != 0xFF03:
            continue
        device = hid.Device(path=d["path"])
        device.nonblocking = True
        return device
    raise SystemExit("FF03 not found")


def w(device, payload: bytes, note: str) -> None:
    try:
        n = device.write(payload)
        print(f"WRITE {note} sent={n} {payload[:8].hex()}", flush=True)
    except Exception as e:
        print(f"WRITE FAIL {note} {e}", flush=True)


def hx(raw: bytes) -> str:
    return " ".join(f"{b:02X}" for b in raw[:12]) + f" n={len(raw)}"


def main() -> int:
    seconds = float(sys.argv[1]) if len(sys.argv) > 1 else 20.0
    device = open_ff03()
    print("OPEN FF03 — mash extra buttons now", flush=True)
    w(device, bytes([0x00, 0xB5, 0x2D, 0, 0, 0, 0, 0, 0] + [0] * 24)[:33], "b52d keepalive")
    w(device, bytes([0x00, 0x0A, 0x03, 0x24] + [0] * 29), "0a0324")
    w(device, bytes([0x0A, 0x03, 0x24] + [0] * 30), "0a0324 no-rid")
    end = time.time() + seconds
    last_keep = time.time()
    interesting = 0
    try:
        while time.time() < end:
            now = time.time()
            if now - last_keep > 0.8:
                last_keep = now
                try:
                    device.write(bytes([0x00, 0xB5, 0x2D, 0, 0, 0, 0, 0, 0] + [0] * 24)[:33])
                except Exception:
                    pass
            data = device.read(128)
            if not data:
                time.sleep(0.002)
                continue
            raw = bytes(data)
            if len(raw) >= 2 and raw[0] == 0x0A and raw[1] in (0x9C, 0x26):
                continue
            interesting += 1
            print(f"{time.strftime('%H:%M:%S')} {hx(raw)}", flush=True)
    finally:
        device.close()
    print(f"DONE-P8 interesting={interesting}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
