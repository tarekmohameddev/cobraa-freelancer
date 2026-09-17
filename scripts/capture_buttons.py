"""Capture extra mouse-button signatures (generic AI-mouse layout).

Prints keyboard / consumer / extra mouse buttons from the composite device,
plus vendor HID packets that are not the high-rate audio stream.
"""

from __future__ import annotations

import collections
import ctypes
import sys
import threading
import time
from ctypes import POINTER, Structure, WINFUNCTYPE, byref, sizeof, wintypes

import hid

WM_DESTROY = 0x0002
WM_INPUT = 0x00FF

RID_INPUT = 0x10000003
RIDI_DEVICENAME = 0x20000007
RIM_TYPEMOUSE = 0
RIM_TYPEKEYBOARD = 1
RIM_TYPEHID = 2
RIDEV_INPUTSINK = 0x00000100
RI_KEY_BREAK = 1

LONG_PTR = ctypes.c_int64 if sizeof(ctypes.c_void_p) == 8 else ctypes.c_long
UINT_PTR = ctypes.c_uint64 if sizeof(ctypes.c_void_p) == 8 else ctypes.c_uint
WNDPROC = WINFUNCTYPE(LONG_PTR, wintypes.HWND, wintypes.UINT, UINT_PTR, UINT_PTR)

user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
user32.DefWindowProcW.argtypes = [wintypes.HWND, wintypes.UINT, UINT_PTR, UINT_PTR]
user32.DefWindowProcW.restype = LONG_PTR
user32.GetRawInputData.argtypes = [UINT_PTR, wintypes.UINT, ctypes.c_void_p, POINTER(wintypes.UINT), wintypes.UINT]
user32.GetRawInputData.restype = wintypes.UINT


class WNDCLASSEXW(Structure):
    _fields_ = [
        ("cbSize", wintypes.UINT),
        ("style", wintypes.UINT),
        ("lpfnWndProc", WNDPROC),
        ("cbClsExtra", ctypes.c_int),
        ("cbWndExtra", ctypes.c_int),
        ("hInstance", wintypes.HINSTANCE),
        ("hIcon", wintypes.HICON),
        ("hCursor", wintypes.HANDLE),
        ("hbrBackground", wintypes.HBRUSH),
        ("lpszMenuName", wintypes.LPCWSTR),
        ("lpszClassName", wintypes.LPCWSTR),
        ("hIconSm", wintypes.HICON),
    ]


class RAWINPUTDEVICE(Structure):
    _fields_ = [
        ("usUsagePage", wintypes.USHORT),
        ("usUsage", wintypes.USHORT),
        ("dwFlags", wintypes.DWORD),
        ("hwndTarget", wintypes.HWND),
    ]


class RAWINPUTHEADER(Structure):
    _fields_ = [
        ("dwType", wintypes.DWORD),
        ("dwSize", wintypes.DWORD),
        ("hDevice", wintypes.HANDLE),
        ("wParam", wintypes.WPARAM),
    ]


class RAWMOUSE(Structure):
    class _U(ctypes.Union):
        class _S(Structure):
            _fields_ = [("usButtonFlags", wintypes.USHORT), ("usButtonData", wintypes.USHORT)]

        _anonymous_ = ("s",)
        _fields_ = [("ulButtons", wintypes.ULONG), ("s", _S)]

    _anonymous_ = ("u",)
    _fields_ = [
        ("usFlags", wintypes.USHORT),
        ("u", _U),
        ("ulRawButtons", wintypes.ULONG),
        ("lLastX", wintypes.LONG),
        ("lLastY", wintypes.LONG),
        ("ulExtraInformation", wintypes.ULONG),
    ]


class RAWKEYBOARD(Structure):
    _fields_ = [
        ("MakeCode", wintypes.USHORT),
        ("Flags", wintypes.USHORT),
        ("Reserved", wintypes.USHORT),
        ("VKey", wintypes.USHORT),
        ("Message", wintypes.UINT),
        ("ExtraInformation", wintypes.ULONG),
    ]


class RAWHID(Structure):
    _fields_ = [
        ("dwSizeHid", wintypes.DWORD),
        ("dwCount", wintypes.DWORD),
        ("bRawData", ctypes.c_ubyte * 1),
    ]


class RAWINPUT(Structure):
    class _U(ctypes.Union):
        _fields_ = [("mouse", RAWMOUSE), ("keyboard", RAWKEYBOARD), ("hid", RAWHID)]

    _anonymous_ = ("u",)
    _fields_ = [("header", RAWINPUTHEADER), ("u", _U)]


STOP = threading.Event()
NAME_CACHE: dict[int, str] = {}
PREFIX_COUNTS: collections.Counter[str] = collections.Counter()
STANDARD_MOUSE_BTNS = 0x0001 | 0x0002 | 0x0004 | 0x0008 | 0x0010 | 0x0020 | 0x0400 | 0x0800


def log(msg: str) -> None:
    print(f"{time.time():.3f}  {msg}", flush=True)


def hex_bytes(data: bytes, limit: int = 40) -> str:
    s = " ".join(f"{b:02X}" for b in data[:limit])
    if len(data) > limit:
        s += " …"
    return s


def device_name(handle) -> str:
    size = wintypes.UINT(0)
    user32.GetRawInputDeviceInfoW(handle, RIDI_DEVICENAME, None, byref(size))
    if size.value == 0:
        return ""
    buf = ctypes.create_unicode_buffer(size.value)
    user32.GetRawInputDeviceInfoW(handle, RIDI_DEVICENAME, buf, byref(size))
    return buf.value


def cached_name(handle) -> str:
    key = int(handle) if handle else 0
    if key not in NAME_CACHE:
        NAME_CACHE[key] = device_name(handle)
    return NAME_CACHE[key]


def is_mouse_family(name: str) -> bool:
    u = name.upper()
    return "VID_248A" in u or "ITING" in u or "PID_CA08" in u


def vk_name(vk: int) -> str:
    if 0x30 <= vk <= 0x39 or 0x41 <= vk <= 0x5A:
        return chr(vk)
    names = {
        0x08: "BACK",
        0x09: "TAB",
        0x0D: "RETURN",
        0x10: "SHIFT",
        0x11: "CONTROL",
        0x12: "MENU",
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
        0xA0: "LSHIFT",
        0xA1: "RSHIFT",
        0xA2: "LCTRL",
        0xA3: "RCTRL",
        0xA4: "LALT",
        0xA5: "RALT",
        0x5B: "LWIN",
        0x5C: "RWIN",
    }
    return names.get(vk, f"VK_{vk:02X}")


def handle_raw_input(lparam) -> None:
    size = wintypes.UINT(0)
    user32.GetRawInputData(lparam, RID_INPUT, None, byref(size), sizeof(RAWINPUTHEADER))
    if size.value == 0:
        return
    buf = ctypes.create_string_buffer(size.value)
    ok = user32.GetRawInputData(lparam, RID_INPUT, buf, byref(size), sizeof(RAWINPUTHEADER))
    if ok != size.value:
        return
    raw = ctypes.cast(buf, POINTER(RAWINPUT)).contents
    name = cached_name(raw.header.hDevice)
    family = is_mouse_family(name)

    if raw.header.dwType == RIM_TYPEKEYBOARD:
        kb = raw.keyboard
        if kb.Flags & RI_KEY_BREAK:
            return
        tag = "MOUSE-KBD" if family else "SYS-KBD"
        # Ignore obvious typing from the real keyboard unless it is the mouse.
        if not family:
            return
        log(f"{tag} DOWN {vk_name(kb.VKey)} make={kb.MakeCode:02X} flags={kb.Flags}")
        return

    if not family:
        return

    if raw.header.dwType == RIM_TYPEMOUSE:
        flags = raw.mouse.usButtonFlags
        extra = flags & ~STANDARD_MOUSE_BTNS
        if extra or (raw.mouse.ulRawButtons & ~0x7):
            log(
                f"MOUSE-BTN flags={flags:#06x} extra={extra:#06x} "
                f"rawButtons={raw.mouse.ulRawButtons:#x}"
            )
        return

    if raw.header.dwType == RIM_TYPEHID:
        nbytes = raw.hid.dwSizeHid * raw.hid.dwCount
        data = ctypes.string_at(ctypes.addressof(raw.hid.bRawData), nbytes)
        prefix = hex_bytes(data[:4])
        PREFIX_COUNTS[prefix] += 1
        # Audio/telemetry: 33B noisy packets. Keep sparse or uncommon prefixes.
        trailing_zeros = data[-16:].count(0) if len(data) >= 16 else 0
        rare = PREFIX_COUNTS[prefix] <= 8
        sparse = trailing_zeros >= 12
        if rare or sparse:
            mi = "MI_?"
            if "MI_" in name.upper():
                mi = "MI_" + name.upper().split("MI_", 1)[1][:12]
            log(f"HID {mi} {nbytes}B {hex_bytes(data)}")


@WNDPROC
def wnd_proc(hwnd, msg, wparam, lparam):
    if msg == WM_INPUT:
        try:
            handle_raw_input(lparam)
        except Exception as e:
            log(f"WM_INPUT err {e}")
        return 0
    if msg == WM_DESTROY:
        user32.PostQuitMessage(0)
        return 0
    return user32.DefWindowProcW(hwnd, msg, wparam, lparam)


def hidapi_loop(dev_info: dict) -> None:
    up = int(dev_info.get("usage_page") or 0)
    us = int(dev_info.get("usage") or 0)
    iface = dev_info.get("interface_number")
    label = f"MI_{iface} up={up:04X} us={us:04X}"
    if up == 0x01 and us == 0x02:
        return
    try:
        device = hid.Device(path=dev_info["path"])
        device.nonblocking = True
    except Exception as e:
        log(f"HIDAPI FAIL {label} {e}")
        return
    log(f"HIDAPI OPEN {label} in-size-hint=128")
    last = b""
    last_print = 0.0
    seen: collections.Counter[str] = collections.Counter()
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
            prefix = raw[:2].hex()
            seen[prefix] += 1
            trailing_zeros = raw[-16:].count(0) if len(raw) >= 16 else 0
            noisy = len(raw) >= 24 and trailing_zeros < 8
            now = time.time()
            # Always log the first few packets of each prefix (button frames
            # may be mixed into the noisy vendor stream).
            if seen[prefix] <= 6 or trailing_zeros >= 12 or (not noisy) or now - last_print >= 2.5:
                last_print = now
                log(f"HIDAPI {label} #{seen[prefix]} {len(raw)}B {hex_bytes(raw)}")
    except Exception as e:
        log(f"HIDAPI ERR {label} {e}")
    finally:
        try:
            device.close()
        except Exception:
            pass


def main() -> int:
    timeout_s = float(sys.argv[1]) if len(sys.argv) > 1 else 120.0
    extras = [d for d in hid.enumerate() if int(d.get("vendor_id") or 0) == 0x248A]
    print(f"Found {len(extras)} HID collections for VID_248A", flush=True)
    for d in extras:
        t = threading.Thread(target=hidapi_loop, args=(d,), daemon=True)
        t.start()

    hinst = kernel32.GetModuleHandleW(None)
    cls_name = "CobraaButtonCapture"
    wndclass = WNDCLASSEXW()
    wndclass.cbSize = sizeof(WNDCLASSEXW)
    wndclass.lpfnWndProc = wnd_proc
    wndclass.hInstance = hinst
    wndclass.lpszClassName = cls_name
    if not user32.RegisterClassExW(byref(wndclass)):
        print("RegisterClassExW failed", ctypes.get_last_error())
        return 1

    # Real hidden popup window — more reliable for RIDEV_INPUTSINK than HWND_MESSAGE.
    WS_POPUP = 0x80000000
    hwnd = user32.CreateWindowExW(0, cls_name, "cobraa-capture", WS_POPUP, 0, 0, 1, 1, None, None, hinst, None)
    if not hwnd:
        print("CreateWindowExW failed", ctypes.get_last_error())
        return 1

    devices = (RAWINPUTDEVICE * 4)()
    specs = [
        (0x01, 0x06, RIDEV_INPUTSINK),
        (0x01, 0x02, RIDEV_INPUTSINK),
        (0x0C, 0x01, RIDEV_INPUTSINK),
        (0x01, 0x80, RIDEV_INPUTSINK),
    ]
    for i, (page, usage, flags) in enumerate(specs):
        devices[i].usUsagePage = page
        devices[i].usUsage = usage
        devices[i].dwFlags = flags
        devices[i].hwndTarget = hwnd
    if not user32.RegisterRawInputDevices(devices, len(specs), sizeof(RAWINPUTDEVICE)):
        print("RegisterRawInputDevices failed", ctypes.get_last_error())
        return 1

    print("\nREADY. Please do this with the 4 extra mouse buttons (not left/right/wheel):")
    print("  1) Click TRANSLATE once, wait 2 seconds")
    print("  2) Click AI once, wait 2 seconds")
    print("  3) Click VOICE once, wait 2 seconds")
    print("  4) Click OCR once, wait 2 seconds")
    print("  5) Hold TRANSLATE for ~1 second")
    print("  6) Double-click AI")
    print(f"Timeout {timeout_s:.0f}s\n", flush=True)

    def killer():
        STOP.wait(timeout_s)
        user32.PostMessageW(hwnd, WM_DESTROY, 0, 0)

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
