"""Interactive extra-button learner: logs every key / extra mouse button / vendor HID."""

from __future__ import annotations

import ctypes
import json
import sys
import threading
import time
from ctypes import POINTER, Structure, WINFUNCTYPE, byref, sizeof, wintypes
from pathlib import Path

import hid

WH_KEYBOARD_LL = 13
WH_MOUSE_LL = 14
WM_KEYDOWN = 0x0100
WM_KEYUP = 0x0101
WM_SYSKEYDOWN = 0x0104
WM_SYSKEYUP = 0x0105
WM_XBUTTONDOWN = 0x020B
WM_XBUTTONUP = 0x020C
WM_MBUTTONDOWN = 0x0207
WM_MBUTTONUP = 0x0208
WM_LBUTTONDOWN = 0x0201
WM_RBUTTONDOWN = 0x0204

LONG_PTR = ctypes.c_int64 if sizeof(ctypes.c_void_p) == 8 else ctypes.c_long
UINT_PTR = ctypes.c_uint64 if sizeof(ctypes.c_void_p) == 8 else ctypes.c_uint
HOOKPROC = WINFUNCTYPE(LONG_PTR, ctypes.c_int, UINT_PTR, UINT_PTR)

user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
user32.CallNextHookEx.argtypes = [wintypes.HANDLE, ctypes.c_int, UINT_PTR, UINT_PTR]
user32.CallNextHookEx.restype = LONG_PTR
user32.SetWindowsHookExW.argtypes = [ctypes.c_int, HOOKPROC, wintypes.HINSTANCE, wintypes.DWORD]
user32.SetWindowsHookExW.restype = wintypes.HHOOK
user32.UnhookWindowsHookEx.argtypes = [wintypes.HHOOK]
user32.UnhookWindowsHookEx.restype = wintypes.BOOL


class KBDLLHOOKSTRUCT(Structure):
    _fields_ = [
        ("vkCode", wintypes.DWORD),
        ("scanCode", wintypes.DWORD),
        ("flags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", UINT_PTR),
    ]


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


MODIFIERS = {0x10, 0x11, 0x12, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0x5B, 0x5C}
STOP = threading.Event()
LOG = Path(__file__).resolve().parent / "learn-log.jsonl"
kbd_hook = None
mouse_hook = None


def vk_name(vk: int) -> str:
    if 0x30 <= vk <= 0x39 or 0x41 <= vk <= 0x5A:
        return chr(vk)
    names = {
        0x08: "BACK",
        0x09: "TAB",
        0x0D: "RETURN",
        0x1B: "ESCAPE",
        0x20: "SPACE",
        0x70: "F1",
        0x71: "F2",
        0x72: "F3",
        0x73: "F4",
        0x74: "F5",
        0x75: "F6",
        0x76: "F7",
        0x77: "F8",
        0x78: "F9",
        0x79: "F10",
        0x7A: "F11",
        0x7B: "F12",
        0xA6: "BROWSER_BACK",
        0xA7: "BROWSER_FORWARD",
        0xAD: "VOLUME_MUTE",
        0xB3: "MEDIA_PLAY_PAUSE",
        0xB6: "LAUNCH_APP1",
        0xB7: "LAUNCH_APP2",
    }
    return names.get(vk, f"VK_{vk:02X}")


def emit(kind: str, signature: str, down: bool, **extra) -> None:
    rec = {"ts": time.time(), "kind": kind, "signature": signature, "down": down, **extra}
    line = json.dumps(rec)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")
    print(f"EVENT {kind} {signature} {'DOWN' if down else 'UP'}", flush=True)


@HOOKPROC
def kbd_proc(nCode, wParam, lParam):
    if nCode >= 0:
        try:
            info = ctypes.cast(int(lParam), POINTER(KBDLLHOOKSTRUCT)).contents
            vk = int(info.vkCode)
            if vk not in MODIFIERS and vk != 0x1B:
                down = int(wParam) in (WM_KEYDOWN, WM_SYSKEYDOWN)
                up = int(wParam) in (WM_KEYUP, WM_SYSKEYUP)
                if down or up:
                    emit("llkbd", f"llkbd:{vk_name(vk)}", down, vk=vk)
        except Exception:
            pass
    return user32.CallNextHookEx(kbd_hook, nCode, wParam, lParam)


@HOOKPROC
def mouse_proc(nCode, wParam, lParam):
    if nCode >= 0:
        try:
            msg = int(wParam)
            if msg in (WM_LBUTTONDOWN, WM_RBUTTONDOWN):
                pass
            elif msg in (WM_XBUTTONDOWN, WM_XBUTTONUP):
                info = ctypes.cast(int(lParam), POINTER(MSLLHOOKSTRUCT)).contents
                which = (int(info.mouseData) >> 16) & 0xFFFF
                sig = "llmouse:x2" if which == 2 else "llmouse:x1"
                emit("llmouse", sig, msg == WM_XBUTTONDOWN, mouseData=int(info.mouseData))
            elif msg in (WM_MBUTTONDOWN, WM_MBUTTONUP):
                emit("llmouse", "llmouse:middle", msg == WM_MBUTTONDOWN)
        except Exception:
            pass
    return user32.CallNextHookEx(mouse_hook, nCode, wParam, lParam)


def hid_loop() -> None:
    for d in hid.enumerate():
        if int(d.get("vendor_id") or 0) != 0x248A:
            continue
        up = int(d.get("usage_page") or 0)
        us = int(d.get("usage") or 0)
        if up == 0x01 and us == 0x02:
            continue
        if up < 0xFF00:
            continue
        threading.Thread(target=_read_one, args=(d,), daemon=True).start()


def _read_one(dev_info: dict) -> None:
    try:
        device = hid.Device(path=dev_info["path"])
        device.nonblocking = True
    except Exception as e:
        print(f"HID open fail {e}", flush=True)
        return
    last = b""
    try:
        while not STOP.is_set():
            data = device.read(128)
            if not data:
                time.sleep(0.004)
                continue
            raw = bytes(data)
            if raw == last:
                continue
            last = raw
            if len(raw) >= 2 and raw[0] == 0x0A and raw[1] in (0x9C, 0x26):
                continue
            hx = " ".join(f"{b:02X}" for b in raw[:16])
            emit("hid", f"hid:{raw[:4].hex()}", True, hex=hx, nbytes=len(raw))
    except Exception:
        pass
    finally:
        try:
            device.close()
        except Exception:
            pass


def main() -> int:
    if LOG.exists():
        LOG.unlink()
    LOG.write_text("", encoding="utf-8")
    print("LEARNER READY. Extra-button events will print as EVENT lines.", flush=True)
    hid_loop()
    global kbd_hook, mouse_hook
    kbd_hook = user32.SetWindowsHookExW(WH_KEYBOARD_LL, kbd_proc, None, 0)
    mouse_hook = user32.SetWindowsHookExW(WH_MOUSE_LL, mouse_proc, None, 0)
    if not kbd_hook or not mouse_hook:
        print("HOOK FAIL", ctypes.get_last_error(), flush=True)
        return 1
    print("hooks installed", flush=True)
    timeout = float(sys.argv[1]) if len(sys.argv) > 1 else 180.0

    def killer():
        STOP.wait(timeout)
        user32.PostQuitMessage(0)

    threading.Thread(target=killer, daemon=True).start()
    msg = wintypes.MSG()
    while user32.GetMessageW(byref(msg), None, 0, 0) != 0:
        user32.TranslateMessage(byref(msg))
        user32.DispatchMessageW(byref(msg))
    STOP.set()
    if kbd_hook:
        user32.UnhookWindowsHookEx(kbd_hook)
    if mouse_hook:
        user32.UnhookWindowsHookEx(mouse_hook)
    print("Stopped.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
