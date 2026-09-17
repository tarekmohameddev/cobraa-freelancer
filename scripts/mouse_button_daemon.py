"""Generic extra-button daemon for AI-style composite USB mice.

Discovers devices that expose a standard mouse plus extra HID collections
(vendor / keyboard / consumer). Emits one JSON object per line on stdout:

  {"type":"status", ...}
  {"type":"raw", "signature":"kbd:F8", "down": true, ...}
  {"type":"error", "message":"..."}

Never claims the pointer collection, so the OS cursor keeps working.
"""

from __future__ import annotations

import argparse
import collections
import ctypes
import json
import sys
import threading
import time
from ctypes import POINTER, Structure, WINFUNCTYPE, byref, sizeof, wintypes
from typing import Any

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
STANDARD_MOUSE_BTNS = 0x0001 | 0x0002 | 0x0004 | 0x0008 | 0x0010 | 0x0020 | 0x0400 | 0x0800

LONG_PTR = ctypes.c_int64 if sizeof(ctypes.c_void_p) == 8 else ctypes.c_long
UINT_PTR = ctypes.c_uint64 if sizeof(ctypes.c_void_p) == 8 else ctypes.c_uint
WNDPROC = WINFUNCTYPE(LONG_PTR, wintypes.HWND, wintypes.UINT, UINT_PTR, UINT_PTR)

user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
user32.DefWindowProcW.argtypes = [wintypes.HWND, wintypes.UINT, UINT_PTR, UINT_PTR]
user32.DefWindowProcW.restype = LONG_PTR
user32.GetRawInputData.argtypes = [
    UINT_PTR,
    wintypes.UINT,
    ctypes.c_void_p,
    POINTER(wintypes.UINT),
    wintypes.UINT,
]
user32.GetRawInputData.restype = wintypes.UINT

STOP = threading.Event()
NAME_CACHE: dict[int, str] = {}
# Signatures that fire during idle (telemetry / audio / movement).
IGNORE: set[str] = set()
PREFIX_RATE: collections.deque[tuple[float, str]] = collections.deque()
HELD: dict[str, float] = {}
HOLD_LOCK = threading.Lock()
BASELINE_UNTIL = 0.0
WATCHED_VID_PID: set[tuple[int, int]] = set()

VK_NAMES = {
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


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def log_err(msg: str) -> None:
    sys.stderr.write(msg + "\n")
    sys.stderr.flush()


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


def cached_name(handle) -> str:
    key = int(handle) if handle else 0
    if key not in NAME_CACHE:
        NAME_CACHE[key] = device_name(handle)
    return NAME_CACHE[key]


def parse_vid_pid(name: str) -> tuple[int, int] | None:
    u = name.upper()
    vid = pid = None
    if "VID_" in u:
        try:
            vid = int(u.split("VID_", 1)[1][:4], 16)
        except ValueError:
            return None
    if "PID_" in u:
        try:
            pid = int(u.split("PID_", 1)[1][:4], 16)
        except ValueError:
            return None
    if vid is None or pid is None:
        return None
    return vid, pid


def is_watched_name(name: str) -> bool:
    parsed = parse_vid_pid(name)
    if not parsed:
        return False
    return parsed in WATCHED_VID_PID


def is_mouse_pointer(dev: dict[str, Any]) -> bool:
    return int(dev.get("usage_page") or 0) == 0x01 and int(dev.get("usage") or 0) == 0x02


def discover_ai_mice() -> list[dict[str, Any]]:
    groups: dict[tuple[int, int], list[dict[str, Any]]] = {}
    for d in hid.enumerate():
        vid = int(d.get("vendor_id") or 0)
        pid = int(d.get("product_id") or 0)
        if vid == 0:
            continue
        groups.setdefault((vid, pid), []).append(d)

    extras: list[dict[str, Any]] = []
    WATCHED_VID_PID.clear()
    devices_out = []
    for (vid, pid), group in groups.items():
        has_mouse = any(is_mouse_pointer(d) for d in group)
        extra = [d for d in group if not is_mouse_pointer(d)]
        if not has_mouse or not extra:
            continue
        WATCHED_VID_PID.add((vid, pid))
        extras.extend(extra)
        mfr = next((d.get("manufacturer_string") for d in group if d.get("manufacturer_string")), "") or ""
        prod = next((d.get("product_string") for d in group if d.get("product_string")), "") or ""
        devices_out.append(
            {
                "vid": vid,
                "pid": pid,
                "name": " ".join(x.strip() for x in (mfr, prod) if x).strip() or f"VID_{vid:04X}&PID_{pid:04X}",
                "collections": len(group),
            }
        )
    emit({"type": "status", "listening": True, "devices": devices_out})
    return extras


def mark_high_rate(signature: str) -> None:
    now = time.time()
    PREFIX_RATE.append((now, signature))
    while PREFIX_RATE and now - PREFIX_RATE[0][0] > 1.0:
        PREFIX_RATE.popleft()
    count = sum(1 for _, s in PREFIX_RATE if s == signature)
    if count >= 12:
        IGNORE.add(signature)


LEARN = threading.Event()


def stdin_loop() -> None:
    try:
        for line in sys.stdin:
            cmd = line.strip().upper()
            if cmd == "LEARN":
                LEARN.set()
            elif cmd == "IDLE":
                LEARN.clear()
            elif cmd in ("QUIT", "EXIT"):
                break
    except Exception:
        pass
    STOP.set()


def should_emit(signature: str) -> bool:
    if ":tele:" in signature:
        return False
    if ":p8:" in signature or ":st26:" in signature:
        return True
    if LEARN.is_set():
        return True
    if signature in IGNORE:
        return False
    if time.time() < BASELINE_UNTIL:
        IGNORE.add(signature)
        return False
    return True


def emit_edge(signature: str, down: bool, extra: dict[str, Any]) -> None:
    if not should_emit(signature) and down:
        return
    payload = {"type": "raw", "signature": signature, "down": down, **extra}
    emit(payload)


def note_hold(signature: str, extra: dict[str, Any]) -> None:
    """Vendor packets often pulse without a matching zero report. Track hold."""
    now = time.time()
    with HOLD_LOCK:
        first = signature not in HELD
        HELD[signature] = now
    if first:
        emit_edge(signature, True, extra)


def release_stale_holds() -> None:
    now = time.time()
    stale: list[str] = []
    with HOLD_LOCK:
        for sig, ts in list(HELD.items()):
            if now - ts > 0.09:
                stale.append(sig)
                del HELD[sig]
    for sig in stale:
        emit({"type": "raw", "signature": sig, "down": False, "source": "hold-timeout"})


def hid_signature(vid: int, pid: int, iface: int, usage_page: int, data: bytes) -> str | None:
    if not data:
        return None
    body = data[1:] if data[0] == 0x00 and len(data) > 1 else data
    # Official Ai mouse 6.2 P8-HIDRAWDATA extra keys on FF03:
    #   0A 03 21/23/24  01=down  00=up
    if len(body) >= 4 and body[0] == 0x0A and body[1] == 0x03:
        down = body[3] != 0
        return f"hid:{vid:04X}:{pid:04X}:p8:{body[2]:02X}:{'down' if down else 'up'}"
    # 0A 26 is the extra-button status frame (not audio). Byte 5 encodes
    # which of the 4 keys and down/up — confirmed against live presses:
    #   41 down-1, 42 down-2, 43 down-3, 51 down-4, 32 up-2, 31 up-4
    # 25/26 (and other high-nibble-2 values) are idle telemetry, not keys 5/6.
    if len(body) >= 6 and body[0] == 0x0A and body[1] == 0x26:
        b5 = body[5]
        low = b5 & 0x07
        if 1 <= low <= 4:
            key = 4 if (b5 & 0x10) and low == 1 else low
            if 1 <= key <= 4:
                down = (b5 >> 4) >= 4
                return f"hid:{vid:04X}:{pid:04X}:st26:{key}:{'down' if down else 'up'}"
        return f"hid:{vid:04X}:{pid:04X}:tele:26"
    if len(body) >= 2 and body[0] == 0x0A and body[1] == 0x9C:
        return f"hid:{vid:04X}:{pid:04X}:tele:9C"
    prefix = data[:2].hex()
    trailing_zeros = data[-16:].count(0) if len(data) >= 16 else 0
    if trailing_zeros >= 12 and len(data) >= 6:
        # Sparse control frame — use a stable opcode + a likely button byte.
        return f"hid:{vid:04X}:{pid:04X}:mi{iface}:{prefix}:{data[5]:02X}"
    if len(data) <= 8:
        return f"hid:{vid:04X}:{pid:04X}:mi{iface}:{data.hex()}"
    return f"hid:{vid:04X}:{pid:04X}:mi{iface}:{prefix}:{len(data)}"


def hidapi_loop(dev_info: dict[str, Any]) -> None:
    vid = int(dev_info.get("vendor_id") or 0)
    pid = int(dev_info.get("product_id") or 0)
    up = int(dev_info.get("usage_page") or 0)
    us = int(dev_info.get("usage") or 0)
    iface = int(dev_info.get("interface_number") or 0)
    if up == 0x01 and us in (0x02, 0x06):
        return
    extra_base = {"source": "hidapi", "vid": vid, "pid": pid, "iface": iface, "usagePage": up, "usage": us}
    try:
        device = hid.Device(path=dev_info["path"])
        device.nonblocking = True
        log_err(f"open MI_{iface} up={up:04X} us={us:04X}")
    except Exception as e:
        log_err(f"open failed MI_{iface} up={up:04X} us={us:04X}: {e}")
        return
    last = b""
    last_keep = 0.0
    try:
        # Official HidDeviceListener writes 33-byte reports with NO report-id prefix.
        # 0A 03 24 is their "write buf"; 0A 03 21/23 program extra-key reports.
        if up == 0xFF03:
            for payload in (
                bytes.fromhex("0a0324") + bytes(30),
                bytes.fromhex("0a0139") + bytes(30),
            ):
                try:
                    n = device.write(payload[:33])
                    log_err(f"FF03 write {payload[:4].hex()} sent={n}")
                except Exception as e:
                    log_err(f"FF03 write fail {payload[:4].hex()}: {e}")
        while not STOP.is_set():
            now = time.time()
            if up == 0xFF03 and now - last_keep > 0.8:
                last_keep = now
                try:
                    device.write(bytes.fromhex("0a0324") + bytes(30))
                except Exception:
                    pass
            data = device.read(128)
            if not data:
                time.sleep(0.003)
                continue
            raw = bytes(data)
            if raw == last:
                continue
            last = raw
            sig = hid_signature(vid, pid, iface, up, raw)
            if not sig:
                continue
            mark_high_rate(sig)
            if ":p8:" in sig or ":st26:" in sig:
                stable = sig.replace(":down", "").replace(":up", "")
                down = sig.endswith(":down")
                if ":st26:" in sig:
                    log_err(f"{stable} {'down' if down else 'up'}")
                emit_edge(stable, down, {**extra_base, "bytes": len(raw)})
                continue
            if ":tele:" in sig:
                IGNORE.add(sig)
                continue
            hx = " ".join(f"{b:02X}" for b in raw[:8])
            log_err(f"hid {sig} {hx}")
            note_hold(sig, {**extra_base, "bytes": len(raw)})
    except Exception as e:
        log_err(f"read failed MI_{iface}: {e}")
    finally:
        try:
            device.close()
        except Exception:
            pass


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
    parsed = parse_vid_pid(name)
    if not is_watched_name(name):
        return
    vid, pid = parsed if parsed else (0, 0)

    if raw.header.dwType == RIM_TYPEKEYBOARD:
        kb = raw.keyboard
        sig = f"kbd:{vid:04X}:{pid:04X}:{vk_name(kb.VKey)}"
        down = not bool(kb.Flags & RI_KEY_BREAK)
        emit_edge(sig, down, {"source": "keyboard", "vid": vid, "pid": pid, "vk": kb.VKey, "make": kb.MakeCode})
        return

    if raw.header.dwType == RIM_TYPEMOUSE:
        flags = raw.mouse.usButtonFlags
        extra_flags = flags & ~STANDARD_MOUSE_BTNS
        if extra_flags & 0x0040:
            emit_edge(f"mouse:{vid:04X}:{pid:04X}:x1", True, {"source": "mouse", "vid": vid, "pid": pid})
        if extra_flags & 0x0080:
            emit_edge(f"mouse:{vid:04X}:{pid:04X}:x1", False, {"source": "mouse", "vid": vid, "pid": pid})
        if extra_flags & 0x0100:
            emit_edge(f"mouse:{vid:04X}:{pid:04X}:x2", True, {"source": "mouse", "vid": vid, "pid": pid})
        if extra_flags & 0x0200:
            emit_edge(f"mouse:{vid:04X}:{pid:04X}:x2", False, {"source": "mouse", "vid": vid, "pid": pid})
        return

    if raw.header.dwType == RIM_TYPEHID:
        nbytes = raw.hid.dwSizeHid * raw.hid.dwCount
        data = ctypes.string_at(ctypes.addressof(raw.hid.bRawData), nbytes)
        sig = hid_signature(vid, pid, -1, 0, data)
        if not sig:
            return
        mark_high_rate(sig)
        if ":tele:" in sig:
            IGNORE.add(sig)
            return
        note_hold(sig, {"source": "rawhid", "vid": vid, "pid": pid, "bytes": nbytes})


@WNDPROC
def wnd_proc(hwnd, msg, wparam, lparam):
    if msg == WM_INPUT:
        try:
            handle_raw_input(lparam)
        except Exception as e:
            log_err(f"WM_INPUT {e}")
        return 0
    if msg == WM_DESTROY:
        user32.PostQuitMessage(0)
        return 0
    return user32.DefWindowProcW(hwnd, msg, wparam, lparam)


def hold_watchdog() -> None:
    while not STOP.is_set():
        release_stale_holds()
        time.sleep(0.02)


def main() -> int:
    global BASELINE_UNTIL
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=float, default=1.6)
    parser.add_argument("--hid-only", action="store_true", help="Vendor HID only; Electron owns Raw Input")
    args = parser.parse_args()

    extras = discover_ai_mice()
    # Pointer collection must stay with Windows. Everything else (vendor FF03,
    # MI_02 65-byte control, consumer, system) can carry extra-button frames.
    hid_targets = []
    for d in extras:
        up = int(d.get("usage_page") or 0)
        us = int(d.get("usage") or 0)
        if up == 0x01 and us in (0x02, 0x06):
            continue
        hid_targets.append(d)
    BASELINE_UNTIL = time.time() + args.baseline
    for d in hid_targets:
        threading.Thread(target=hidapi_loop, args=(d,), daemon=True).start()
    threading.Thread(target=hold_watchdog, daemon=True).start()
    threading.Thread(target=stdin_loop, daemon=True).start()

    if args.hid_only:
        emit({"type": "status", "baselineMs": int(args.baseline * 1000), "message": "hid-only vendor listener"})
        STOP.wait()
        return 0

    hinst = kernel32.GetModuleHandleW(None)
    cls_name = "CobraaMouseButtonDaemon"
    wndclass = WNDCLASSEXW()
    wndclass.cbSize = sizeof(WNDCLASSEXW)
    wndclass.lpfnWndProc = wnd_proc
    wndclass.hInstance = hinst
    wndclass.lpszClassName = cls_name
    if not user32.RegisterClassExW(byref(wndclass)):
        emit({"type": "error", "message": f"RegisterClassExW failed ({ctypes.get_last_error()})"})
        return 1

    WS_POPUP = 0x80000000
    hwnd = user32.CreateWindowExW(0, cls_name, "cobraa-mouse", WS_POPUP, 0, 0, 1, 1, None, None, hinst, None)
    if not hwnd:
        emit({"type": "error", "message": f"CreateWindowExW failed ({ctypes.get_last_error()})"})
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
        emit({"type": "error", "message": f"RegisterRawInputDevices failed ({ctypes.get_last_error()})"})
        return 1

    emit({"type": "status", "baselineMs": int(args.baseline * 1000), "message": "idle baseline running"})

    msg = wintypes.MSG()
    while user32.GetMessageW(byref(msg), None, 0, 0) != 0:
        user32.TranslateMessage(byref(msg))
        user32.DispatchMessageW(byref(msg))
    STOP.set()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        STOP.set()
        raise SystemExit(0)
