"""Listen on MI_02 (65-byte control) and sparse MI_01 frames. Probe a few enable writes."""

from __future__ import annotations

import sys
import threading
import time

import hid

STOP = threading.Event()
LOCK = threading.Lock()
EVENTS: list[str] = []


def log(msg: str) -> None:
    line = f"{time.strftime('%H:%M:%S')} {msg}"
    with LOCK:
        EVENTS.append(line)
    print(line, flush=True)


def open_iface(iface: int, usage_page: int | None = None):
    for d in hid.enumerate():
        if int(d.get("vendor_id") or 0) != 0x248A:
            continue
        if int(d.get("interface_number") or -1) != iface:
            continue
        up = int(d.get("usage_page") or 0)
        if usage_page is not None and up != usage_page:
            continue
        us = int(d.get("usage") or 0)
        if up == 0x01 and us == 0x02:
            continue
        try:
            device = hid.Device(path=d["path"])
            device.nonblocking = True
            log(f"OPEN MI_{iface} up={up:04X} us={us:04X} in/out ok")
            return device, up, us
        except Exception as e:
            log(f"OPEN FAIL MI_{iface} up={up:04X} {e}")
    return None, 0, 0


def hx(raw: bytes, n: int = 24) -> str:
    return " ".join(f"{b:02X}" for b in raw[:n]) + (f" … n={len(raw)}" if len(raw) > n else f" n={len(raw)}")


def reader(label: str, device, skip_audio: bool) -> None:
    last = b""
    audio_n = 0
    last_audio = 0.0
    try:
        while not STOP.is_set():
            data = device.read(128)
            if not data:
                time.sleep(0.002)
                continue
            raw = bytes(data)
            if raw == last:
                continue
            last = raw
            audio = skip_audio and len(raw) >= 2 and raw[0] == 0x0A and raw[1] == 0x9C
            if audio:
                audio_n += 1
                now = time.time()
                if now - last_audio > 3:
                    last_audio = now
                    log(f"{label} audio alive count={audio_n} {hx(raw, 8)}")
                continue
            log(f"{label} {hx(raw, 32)}")
    except Exception as e:
        log(f"{label} READ FAIL {e}")
    finally:
        try:
            device.close()
        except Exception:
            pass


def try_write(device, payload: bytes, note: str) -> None:
    if device is None:
        return
    try:
        n = device.write(payload)
        log(f"WRITE {note} sent={n} first={hx(payload, 8)}")
    except Exception as e:
        log(f"WRITE FAIL {note} {e}")


def main() -> int:
    log("=== mash Translate / AI / Voice / OCR extra buttons now ===")
    mi02, up2, us2 = open_iface(2, 0x0001)
    mi01, up1, us1 = open_iface(1, 0xFF03)
    if mi02:
        threading.Thread(target=reader, args=("MI_02", mi02, False), daemon=True).start()
    else:
        log("MI_02 not opened")
    if mi01:
        threading.Thread(target=reader, args=("MI_01", mi01, True), daemon=True).start()
    else:
        log("MI_01 not opened")

    time.sleep(2.0)
    log("--- enable probes ---")
    # 65-byte output includes optional report-id prefix; try both layouts.
    probes = [
        (bytes([0x00] + [0x00] * 64), "mi02 zeros+rid0"),
        (bytes([0x01] + [0x00] * 64), "mi02 cmd01"),
        (bytes([0x0A, 0x01] + [0x00] * 63), "mi02 0A01"),
        (bytes([0x0A, 0x00] + [0x00] * 63), "mi02 0A00"),
        (bytes([0x5A, 0xA5] + [0x00] * 63), "mi02 5AA5"),
        (bytes([0xAA, 0x55] + [0x00] * 63), "mi02 AA55"),
        (bytes([0x02, 0x01] + [0x00] * 63), "mi02 0201"),
        (bytes([0x10, 0x01] + [0x00] * 63), "mi02 1001"),
    ]
    for payload, note in probes:
        try_write(mi02, payload, note)
        time.sleep(0.15)

    if mi01:
        for payload, note in [
            (bytes([0x00] + [0x00] * 32), "mi01 zeros"),
            (bytes([0x0A, 0x01] + [0x00] * 31), "mi01 0A01"),
            (bytes([0x0A, 0x9C, 0x00] + [0x00] * 30), "mi01 0A9C"),
        ]:
            try_write(mi01, payload, note)
            time.sleep(0.15)

    log("--- listening 32s for extra-button packets ---")
    time.sleep(32)
    STOP.set()
    time.sleep(0.3)
    interesting = [e for e in EVENTS if "MI_02 " in e or ("MI_01 " in e and "audio alive" not in e)]
    log(f"DONE-CAPTURE interesting={len(interesting)}")
    return 0 if interesting else 2


if __name__ == "__main__":
    sys.exit(main())
