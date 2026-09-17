"""Poll MI_02 state commands; print only when payload changes."""

from __future__ import annotations

import sys
import time

import hid

# 0x0A/0x0B stalled the USB gadget last time — never send those.
CMDS = (0x02, 0x03, 0x04, 0x06, 0x07, 0x08)


def open_mi02():
    for d in hid.enumerate():
        if int(d.get("vendor_id") or 0) != 0x248A:
            continue
        if int(d.get("interface_number") or -1) != 2:
            continue
        if int(d.get("usage_page") or 0) == 0x01 and int(d.get("usage") or 0) == 0x02:
            continue
        device = hid.Device(path=d["path"])
        device.nonblocking = True
        return device
    raise SystemExit("MI_02 not found")


def drain(device, ms: float) -> list[bytes]:
    end = time.time() + ms / 1000
    got: list[bytes] = []
    while time.time() < end:
        data = device.read(128)
        if data:
            got.append(bytes(data))
        else:
            time.sleep(0.001)
    return got


def hx(raw: bytes, n: int = 16) -> str:
    return " ".join(f"{b:02X}" for b in raw[:n])


def main() -> int:
    seconds = float(sys.argv[1]) if len(sys.argv) > 1 else 25.0
    device = open_mi02()
    print(f"OPEN MI_02 — mash extra buttons for {seconds:.0f}s", flush=True)
    last: dict[int, bytes] = {}
    changes = 0
    end = time.time() + seconds
    try:
        while time.time() < end:
            for cmd in CMDS:
                payload = bytes([0x00, cmd] + [0x00] * 63)
                try:
                    device.write(payload)
                except Exception as e:
                    print(f"WRITE FAIL cmd={cmd:02X} {e}", flush=True)
                    time.sleep(0.2)
                    continue
                replies = drain(device, 25)
                for raw in replies:
                    prev = last.get(cmd)
                    if prev == raw:
                        continue
                    last[cmd] = raw
                    changes += 1
                    print(f"{time.strftime('%H:%M:%S')} cmd={cmd:02X} {hx(raw, 20)} n={len(raw)}", flush=True)
            time.sleep(0.02)
    finally:
        try:
            device.close()
        except Exception:
            pass
    print(f"DONE-POLL changes={changes}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
