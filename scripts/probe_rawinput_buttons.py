"""Generic extra-button probe: Windows Raw Input + quiet HID collections.

Does not claim the mouse pointer. Filters to composite mice that also expose
keyboard / consumer / vendor collections (the usual AI-mouse layout).
"""

from __future__ import annotations

import ctypes
import sys
import threading
import time
from ctypes import POINTER, Structure, WINFUNCTYPE, byref, sizeof, wintypes

import hid

WM_DESTROY = 0x0002
WM_INPUT = 0x00FF
HWND_MESSAGE = wintypes.HWND(-3)

RID_INPUT = 0x10000003
RIDI_DEVICENAME = 0x20000007
RIDI_DEVICEINFO = 0x2000000B

RIM_TYPEMOUSE = 0
RIM_TYPEKEYBOARD = 1
RIM_TYPEHID = 2

RIDEV_INPUTSINK = 0x00000100
RIDEV_PAGEONLY = 0x00000020

RI_MOUSE_BUTTON_4_DOWN = 0x0040
RI_MOUSE_BUTTON_4_UP = 0x0080
RI_MOUSE_BUTTON_5_DOWN = 0x0100
RI_MOUSE_BUTTON_5_UP = 0x0200
RI_KEY_BREAK = 1

user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

LONG_PTR = ctypes.c_int64 if sizeof(ctypes.c_void_p) == 8 else ctypes.c_long
UINT_PTR = ctypes.c_uint64 if sizeof(ctypes.c_void_p) == 8 else ctypes.c_uint
HANDLE_PTR = ctypes.c_void_p
WNDPROC = WINFUNCTYPE(LONG_PTR, wintypes.HWND, wintypes.UINT, UINT_PTR, UINT_PTR)

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


class RAWINPUTDEVICELIST(Structure):
    _fields_ = [("hDevice", wintypes.HANDLE), ("dwType", wintypes.DWORD)]


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


class RID_DEVICE_INFO_MOUSE(Structure):
    _fields_ = [
        ("dwId", wintypes.DWORD),
        ("dwNumberOfButtons", wintypes.DWORD),
        ("dwSampleRate", wintypes.DWORD),
        ("fHasHorizontalWheel", wintypes.BOOL),
    ]


class RID_DEVICE_INFO_KEYBOARD(Structure):
    _fields_ = [
        ("dwType", wintypes.DWORD),
        ("dwSubType", wintypes.DWORD),
        ("dwKeyboardMode", wintypes.DWORD),
        ("dwNumberOfFunctionKeys", wintypes.DWORD),
        ("dwNumberOfIndicators", wintypes.DWORD),
        ("dwNumberOfKeysTotal", wintypes.DWORD),
    ]


class RID_DEVICE_INFO_HID(Structure):
    _fields_ = [
        ("dwVendorId", wintypes.DWORD),
        ("dwProductId", wintypes.DWORD),
        ("dwVersionNumber", wintypes.DWORD),
        ("usUsagePage", wintypes.USHORT),
        ("usUsage", wintypes.USHORT),
    ]


class RID_DEVICE_INFO(Structure):
    class _U(ctypes.Union):
        _fields_ = [
            ("mouse", RID_DEVICE_INFO_MOUSE),
            ("keyboard", RID_DEVICE_INFO_KEYBOARD),
            ("hid", RID_DEVICE_INFO_HID),
        ]

    _anonymous_ = ("u",)
    _fields_ = [
        ("cbSize", wintypes.DWORD),
        ("dwType", wintypes.DWORD),
        ("u", _U),
    ]


VK_NAMES = {
    0x08: "BACK",
    0x09: "TAB",
    0x0D: "RETURN",
    0x10: "SHIFT",
    0x11: "CONTROL",
    0x12: "MENU",
    0x1B: "ESCAPE",
    0x20: "SPACE",
    0x25: "LEFT",
    0x26: "UP",
    0x27: "RIGHT",
    0x28: "DOWN",
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
}


def vk_name(vk: int) -> str:
    if vk in VK_NAMES:
        return VK_NAMES[vk]
    if 0x30 <= vk <= 0x39 or 0x41 <= vk <= 0x5A:
        return chr(vk)
    return f"VK_{vk:02X}"


def device_name(handle) -> str:
    size = wintypes.UINT(0)
    user32.GetRawInputDeviceInfoW(handle, RIDI_DEVICENAME, None, byref(size))
    if size.value == 0:
        return ""
    buf = ctypes.create_unicode_buffer(size.value)
    user32.GetRawInputDeviceInfoW(handle, RIDI_DEVICENAME, buf, byref(size))
    return buf.value


def device_info(handle) -> RID_DEVICE_INFO | None:
    info = RID_DEVICE_INFO()
    info.cbSize = sizeof(RID_DEVICE_INFO)
    size = wintypes.UINT(sizeof(RID_DEVICE_INFO))
    n = user32.GetRawInputDeviceInfoW(handle, RIDI_DEVICEINFO, byref(info), byref(size))
    if n == ctypes.c_uint(-1).value or n == 0:
        return None
    return info


def is_audio_stream(data: bytes) -> bool:
    # High-rate vendor packets seen on MI_01 (mic/telemetry). Button frames
    # are 33 bytes with a stable prefix and a long zero tail.
    if len(data) >= 4 and data[0] == 0x0A and data[1] in (0x9C, 0xFB, 0xEA, 0xD8, 0xC8, 0xB8, 0xA7):
        if data[2] in (0x31, 0x65, 0x74, 0x75, 0x85, 0x86, 0x96, 0x97, 0xA8):
            return True
    return False


def is_sparse_hid(data: bytes) -> bool:
    if len(data) < 8:
        return True
    zeros = data[-16:].count(0)
    return zeros >= 12


def is_target_name(name: str) -> bool:
    u = name.upper()
    return "VID_248A" in u or "ITING" in u


def hex_bytes(data: bytes) -> str:
    return " ".join(f"{b:02X}" for b in data)


STOP = threading.Event()
NAME_CACHE: dict[int, str] = {}


def cached_name(handle) -> str:
    key = int(handle) if handle else 0
    if key not in NAME_CACHE:
        NAME_CACHE[key] = device_name(handle)
    return NAME_CACHE[key]


def log(msg: str) -> None:
    print(f"{time.time():.3f}  {msg}", flush=True)


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
    if not is_target_name(name):
        return

    short = name
    if "MI_" in name.upper():
        try:
            short = name.upper().split("MI_")[1][:18]
        except Exception:
            short = name[-48:]
    else:
        short = name[-48:]
    if raw.header.dwType == RIM_TYPEKEYBOARD:
        kb = raw.keyboard
        edge = "UP" if (kb.Flags & RI_KEY_BREAK) else "DOWN"
        log(
            f"KBD {edge:4} vk={vk_name(kb.VKey):8} make={kb.MakeCode:02X} flags={kb.Flags}  {short}"
        )
    elif raw.header.dwType == RIM_TYPEMOUSE:
        mouse = raw.mouse
        flags = mouse.usButtonFlags
        if flags & (RI_MOUSE_BUTTON_4_DOWN | RI_MOUSE_BUTTON_4_UP | RI_MOUSE_BUTTON_5_DOWN | RI_MOUSE_BUTTON_5_UP):
            parts = []
            if flags & RI_MOUSE_BUTTON_4_DOWN:
                parts.append("X1 DOWN")
            if flags & RI_MOUSE_BUTTON_4_UP:
                parts.append("X1 UP")
            if flags & RI_MOUSE_BUTTON_5_DOWN:
                parts.append("X2 DOWN")
            if flags & RI_MOUSE_BUTTON_5_UP:
                parts.append("X2 UP")
            log(f"MOUSE {' '.join(parts)} rawButtons={mouse.ulRawButtons}  {short}")
        elif mouse.ulRawButtons and mouse.ulRawButtons not in (0, 1, 2, 3):
            log(f"MOUSE extra rawButtons={mouse.ulRawButtons:#x} btnFlags={flags:#x}  {short}")
    elif raw.header.dwType == RIM_TYPEHID:
        hid_part = raw.hid
        nbytes = hid_part.dwSizeHid * hid_part.dwCount
        data = ctypes.string_at(ctypes.addressof(hid_part.bRawData), nbytes)
        # Skip the always-on vendor mic/telemetry stream.
        if is_audio_stream(data):
            return
        if len(data) >= 16 and not is_sparse_hid(data) and data[0] == 0x0A and data[1] != 0x26:
            return
        log(f"HID  {nbytes}B  {hex_bytes(data)}  MI_{short}")


@WNDPROC
def wnd_proc(hwnd, msg, wparam, lparam):
    if msg == WM_INPUT:
        handle_raw_input(lparam)
        return 0
    if msg == WM_DESTROY:
        user32.PostQuitMessage(0)
        return 0
    return user32.DefWindowProcW(hwnd, msg, wparam, lparam)


def list_raw_devices() -> None:
    n = wintypes.UINT(0)
    user32.GetRawInputDeviceList(None, byref(n), sizeof(RAWINPUTDEVICELIST))
    arr = (RAWINPUTDEVICELIST * n.value)()
    user32.GetRawInputDeviceList(arr, byref(n), sizeof(RAWINPUTDEVICELIST))
    print("Raw Input devices matching AI mouse / VID_248A:", flush=True)
    for item in arr:
        name = device_name(item.hDevice)
        if not is_target_name(name):
            continue
        info = device_info(item.hDevice)
        extra = ""
        if info and info.dwType == RIM_TYPEHID:
            extra = f" hid vid={info.hid.dwVendorId:04X} pid={info.hid.dwProductId:04X} up={info.hid.usUsagePage:04X} us={info.hid.usUsage:04X}"
        elif info:
            extra = f" type={info.dwType}"
        print(f"  type={item.dwType} {name}{extra}", flush=True)
    print("", flush=True)


def hid_quiet_loop() -> None:
    """Read non-pointer collections except the noisy vendor mic/telemetry stream."""
    targets = []
    for d in hid.enumerate():
        if int(d.get("vendor_id") or 0) != 0x248A:
            continue
        up = int(d.get("usage_page") or 0)
        us = int(d.get("usage") or 0)
        iface = d.get("interface_number")
        if up == 0x01 and us == 0x02:
            continue
        targets.append(d)

    def one(dev_info):
        label = f"MI_{dev_info.get('interface_number')} up={int(dev_info.get('usage_page') or 0):04X} us={int(dev_info.get('usage') or 0):04X}"
        try:
            device = hid.Device(path=dev_info["path"])
            device.nonblocking = True
        except Exception as e:
            log(f"HIDAPI FAIL {label} {e}")
            return
        log(f"HIDAPI OPEN {label}")
        last = b""
        try:
            while not STOP.is_set():
                data = device.read(64)
                if not data:
                    time.sleep(0.004)
                    continue
                raw = bytes(data)
                if raw == last:
                    continue
                last = raw
                if is_audio_stream(raw) or (len(raw) >= 16 and not is_sparse_hid(raw) and raw[0] == 0x0A and raw[1] != 0x26):
                    continue
                kind = "RELEASE" if all(b == 0 for b in raw) else "REPORT"
                log(f"HIDAPI {kind:7} {label}  {hex_bytes(raw)}")
        except Exception as e:
            log(f"HIDAPI ERR {label} {e}")
        finally:
            try:
                device.close()
            except Exception:
                pass

    threads = [threading.Thread(target=one, args=(d,), daemon=True) for d in targets]
    for t in threads:
        t.start()


def main() -> int:
    timeout_s = float(sys.argv[1]) if len(sys.argv) > 1 else 90.0
    list_raw_devices()
    hid_quiet_loop()

    hinst = kernel32.GetModuleHandleW(None)
    cls_name = "CobraaRawInputProbe"
    wndclass = WNDCLASSEXW()
    wndclass.cbSize = sizeof(WNDCLASSEXW)
    wndclass.lpfnWndProc = wnd_proc
    wndclass.hInstance = hinst
    wndclass.lpszClassName = cls_name
    atom = user32.RegisterClassExW(byref(wndclass))
    if not atom:
        print("RegisterClassExW failed", ctypes.get_last_error())
        return 1

    hwnd = user32.CreateWindowExW(0, cls_name, "probe", 0, 0, 0, 0, 0, HWND_MESSAGE, None, hinst, None)
    if not hwnd:
        print("CreateWindowExW failed", ctypes.get_last_error())
        return 1

    devices = (RAWINPUTDEVICE * 5)()
    specs = [
        (0x01, 0x06, RIDEV_INPUTSINK),  # keyboard
        (0x01, 0x02, RIDEV_INPUTSINK),  # mouse (extra buttons only logged)
        (0x0C, 0x01, RIDEV_INPUTSINK),  # consumer
        (0x01, 0x80, RIDEV_INPUTSINK),  # system control
        (0xFF03, 0x00, RIDEV_INPUTSINK | RIDEV_PAGEONLY),  # vendor page
    ]
    for i, (page, usage, flags) in enumerate(specs):
        devices[i].usUsagePage = page
        devices[i].usUsage = usage
        devices[i].dwFlags = flags
        devices[i].hwndTarget = hwnd

    if not user32.RegisterRawInputDevices(devices, len(specs), sizeof(RAWINPUTDEVICE)):
        print("RegisterRawInputDevices failed", ctypes.get_last_error())
        return 1

    print("Listening. Click Translate, then AI, then Voice, then OCR.")
    print("After that: one long-press and one double-click on any extra button.")
    print(f"Timeout {timeout_s:.0f}s.\n", flush=True)

    def kill_later():
        STOP.wait(timeout_s)
        user32.PostMessageW(hwnd, WM_DESTROY, 0, 0)

    threading.Thread(target=kill_later, daemon=True).start()

    msg = wintypes.MSG()
    while user32.GetMessageW(byref(msg), None, 0, 0) != 0:
        user32.TranslateMessage(byref(msg))
        user32.DispatchMessageW(byref(msg))

    STOP.set()
    print("Stopped.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
