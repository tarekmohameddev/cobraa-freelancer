"""Try MI_02 SET payloads, then listen for unsolicited reports."""

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


def drain(device, ms: float) -> list[bytes]:
    end = time.time() + ms / 1000
    got: list[bytes] = []
    while time.time() < end:
        data = device.read(128)
        if data:
            got.append(bytes(data))
        else:
            time.sleep(0.002)
    return got


def hx(raw: bytes, n: int = 20) -> str:
    return " ".join(f"{b:02X}" for b in raw[:n])


def send(device, payload: bytes, note: str) -> None:
    drain(device, 15)
    try:
        n = device.write(payload)
        print(f"WRITE {note} sent={n} {hx(payload, 8)}", flush=True)
    except Exception as e:
        print(f"WRITE FAIL {note} {e}", flush=True)
        return
    for raw in drain(device, 80):
        print(f"  reply {hx(raw)} n={len(raw)}", flush=True)


def main() -> int:
    device = open_mi02()
    print("OPEN MI_02", flush=True)
    # [reportId=0][cmd][len][data...]
    probes = [
        (bytes([0x00, 0x04, 0x01, 0x01] + [0x00] * 61), "set04 len1=01"),
        (bytes([0x00, 0x04, 0x01, 0x00] + [0x00] * 61), "set04 len1=00"),
        (bytes([0x00, 0x05, 0x01, 0x01] + [0x00] * 61), "set05 len1=01"),
        (bytes([0x00, 0x02, 0x01, 0x01] + [0x00] * 61), "set02 len1=01"),
        (bytes([0x00, 0x06, 0x01, 0x01] + [0x00] * 61), "set06 len1=01"),
        (bytes([0x00, 0x09, 0x01, 0x01] + [0x00] * 61), "set09 len1=01"),
        (bytes([0x00, 0x04, 0x04, 0x01, 0x00, 0x00, 0x00] + [0x00] * 58), "set04 len4=1"),
    ]
    try:
        for payload, note in probes:
            send(device, payload, note)
            time.sleep(0.05)
        print("--- listen 4s unsolicited ---", flush=True)
        n = 0
        for raw in drain(device, 4000):
            n += 1
            print(f"UNSOL {hx(raw)} n={len(raw)}", flush=True)
        print(f"DONE-SET unsolicited={n}", flush=True)
    finally:
        device.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
