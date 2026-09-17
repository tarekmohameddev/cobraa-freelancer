"""Scan MI_02 output opcodes and pair each write with the next input report."""

from __future__ import annotations

import sys
import time

import hid


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


def drain(device, ms: float = 80) -> list[bytes]:
    end = time.time() + ms / 1000
    got: list[bytes] = []
    while time.time() < end:
        data = device.read(128)
        if data:
            got.append(bytes(data))
        else:
            time.sleep(0.002)
    return got


def hx(raw: bytes, n: int = 16) -> str:
    return " ".join(f"{b:02X}" for b in raw[:n])


def scan(device) -> None:
    print("opcode  response", flush=True)
    unique: dict[str, list[str]] = {}
    for cmd in range(0x00, 0x80):
        payload = bytes([0x00, cmd] + [0x00] * 63)
        drain(device, 20)
        try:
            device.write(payload)
        except Exception as e:
            print(f"  {cmd:02X}    WRITE FAIL {e}", flush=True)
            continue
        replies = drain(device, 60)
        if not replies:
            print(f"  {cmd:02X}    (no reply)", flush=True)
            continue
        for raw in replies:
            key = hx(raw, 12)
            unique.setdefault(key, []).append(f"{cmd:02X}")
            extra = ""
            if raw[:2] != b"\x00\x00" and raw[:1] != b"\x02":
                extra = "  *"
            print(f"  {cmd:02X}    {hx(raw, 20)} n={len(raw)}{extra}", flush=True)
    print("\n--- grouped ---", flush=True)
    for key, cmds in unique.items():
        print(f"  {key}  <- {','.join(cmds)}", flush=True)


def main() -> int:
    device = open_mi02()
    print("OPEN MI_02", flush=True)
    try:
        scan(device)
    finally:
        device.close()
    print("DONE-SCAN", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
