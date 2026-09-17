"""HID-only extra-button learner. Ignores normal typing. Logs mouse HID + extra mouse buttons."""

from __future__ import annotations

import ctypes
import json
import sys
import threading
import time
from ctypes import POINTER, Structure, WINFUNCTYPE, byref, sizeof, wintypes
from pathlib import Path

import hid

WH_MOUSE_LL = 14
WM_XBUTTONDOWN = 0x020B
WM_XBUTTONUP = 0x020C
WM_MBUTTONDOWN = 0x0207
WM_MBUTTONUP = 0x0208

LONG_PTR = ctypes.c_int64 if sizeof(ctypes.c_void_p) == 8 else ctypes.c_long
UINT_PTR = ctypes.c_uint64 if sizeof(ctypes.c_void_p) == 8 else ctypes.c_uint
HOOKPROC = WINFUNCTYPE(LONG_PTR, ctypes.c_int, UINT_PTR, UINT_PTR)

user32 = ctypes.WinDLL("user32", use_last_error=True)
user32.CallNextHookEx.argtypes = [wintypes.HANDLE, ctypes.c_int, UINT_PTR, UINT_PTR]
user32.CallNextHookEx.restype = LONG_PTR
user32.SetWindowsHookExW.argtypes = [ctypes.c_int, HOOKPROC, wintypes.HANDLE, wintypes.DWORD]
user32.SetWindowsHookExW.restype = wintypes.HHOOK

STOP = threading.Event()
LOG = Path(__file__).resolve().parent / "learn-log.jsonl"
mouse_hook = None


class POINT(Structure):
    _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]


class MSLLHOOKSTRUCT(Structure):
    _fields_ = [
        ("pt", POINT),
        ("mouseData", wintypes.DWORD),
        ("flags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", UINT_PTR),
    ]


def emit(kind: str, signature: str, **extra) -> None:
    rec = {"ts": time.time(), "kind": kind, "signature": signature, **extra}
    with LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec) + "\n")
    print(f"HIDEVENT {kind} {signature} {extra.get('hex', '')}".strip(), flush=True)


@HOOKPROC
def mouse_proc(nCode, wParam, lParam):
    if nCode >= 0:
        try:
            msg = int(wParam)
            if msg in (WM_XBUTTONDOWN, WM_XBUTTONUP):
                info = ctypes.cast(int(lParam), POINTER(MSLLHOOKSTRUCT)).contents
                which = (int(info.mouseData) >> 16) & 0xFFFF
                sig = "llmouse:x2" if which == 2 else "llmouse:x1"
                emit("llmouse", sig, down=msg == WM_XBUTTONDOWN)
            elif msg in (WM_MBUTTONDOWN, WM_MBUTTONUP):
                emit("llmouse", "llmouse:middle", down=msg == WM_MBUTTONDOWN)
        except Exception:
            pass
    return user32.CallNextHookEx(mouse_hook, nCode, wParam, lParam)


def read_hid(dev_info: dict) -> None:
    vid = int(dev_info.get("vendor_id") or 0)
    pid = int(dev_info.get("product_id") or 0)
    up = int(dev_info.get("usage_page") or 0)
    us = int(dev_info.get("usage") or 0)
    iface = dev_info.get("interface_number")
    label = f"MI_{iface}_up{up:04X}_us{us:04X}"
    try:
        device = hid.Device(path=dev_info["path"])
        device.nonblocking = True
    except Exception as e:
        print(f"OPEN FAIL {label} {e}", flush=True)
        return
    print(f"OPEN {label}", flush=True)
    last = b""
    last_tele = 0.0
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
            hx = " ".join(f"{b:02X}" for b in raw[:20])
            tele = len(raw) >= 2 and raw[0] == 0x0A and raw[1] in (0x9C, 0x26)
            now = time.time()
            if tele:
                # Keep a breadcrumb so we know the stream is alive, but not a flood.
                if now - last_tele > 2.5:
                    last_tele = now
                    emit("tele", f"hid:{vid:04X}:{pid:04X}:tele:{raw[1]:02X}", hex=hx, iface=iface)
                continue
            emit("hid", f"hid:{vid:04X}:{pid:04X}:mi{iface}:{raw[:4].hex()}", hex=hx, iface=iface, nbytes=len(raw))
    except Exception as e:
        print(f"READ FAIL {label} {e}", flush=True)
    finally:
        try:
            device.close()
        except Exception:
            pass


def main() -> int:
    LOG.write_text("", encoding="utf-8")
    print("HID LEARNER READY. Press extra mouse buttons only — do not type.", flush=True)
    for d in hid.enumerate():
        if int(d.get("vendor_id") or 0) != 0x248A:
            continue
        up = int(d.get("usage_page") or 0)
        us = int(d.get("usage") or 0)
        if up == 0x01 and us == 0x02:
            continue
        threading.Thread(target=read_hid, args=(d,), daemon=True).start()

    global mouse_hook
    mouse_hook = user32.SetWindowsHookExW(WH_MOUSE_LL, mouse_proc, None, 0)
    print("mouse extra-button hook", "ok" if mouse_hook else "FAIL", flush=True)

    timeout = float(sys.argv[1]) if len(sys.argv) > 1 else 120.0

    def killer():
        STOP.wait(timeout)
        user32.PostQuitMessage(0)

    threading.Thread(target=killer, daemon=True).start()
    msg = wintypes.MSG()
    while user32.GetMessageW(byref(msg), None, 0, 0) != 0:
        user32.TranslateMessage(byref(msg))
        user32.DispatchMessageW(byref(msg))
    STOP.set()
    print("Stopped.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
