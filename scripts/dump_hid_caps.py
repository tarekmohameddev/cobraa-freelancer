"""Dump HID capabilities for the iTing/Telink mouse using hid.dll."""

from __future__ import annotations

import ctypes
from ctypes import POINTER, Structure, byref, sizeof, wintypes

hid = ctypes.WinDLL("hid")
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
FILE_SHARE_READ = 0x00000001
FILE_SHARE_WRITE = 0x00000002
OPEN_EXISTING = 3
FILE_FLAG_OVERLAPPED = 0x40000000
INVALID_HANDLE_VALUE = wintypes.HANDLE(-1).value


class HIDD_ATTRIBUTES(Structure):
    _fields_ = [
        ("Size", wintypes.ULONG),
        ("VendorID", wintypes.USHORT),
        ("ProductID", wintypes.USHORT),
        ("VersionNumber", wintypes.USHORT),
    ]


class HIDP_CAPS(Structure):
    _fields_ = [
        ("Usage", wintypes.USHORT),
        ("UsagePage", wintypes.USHORT),
        ("InputReportByteLength", wintypes.USHORT),
        ("OutputReportByteLength", wintypes.USHORT),
        ("FeatureReportByteLength", wintypes.USHORT),
        ("Reserved", wintypes.USHORT * 17),
        ("NumberLinkCollectionNodes", wintypes.USHORT),
        ("NumberInputButtonCaps", wintypes.USHORT),
        ("NumberInputValueCaps", wintypes.USHORT),
        ("NumberInputDataIndices", wintypes.USHORT),
        ("NumberOutputButtonCaps", wintypes.USHORT),
        ("NumberOutputValueCaps", wintypes.USHORT),
        ("NumberOutputDataIndices", wintypes.USHORT),
        ("NumberFeatureButtonCaps", wintypes.USHORT),
        ("NumberFeatureValueCaps", wintypes.USHORT),
        ("NumberFeatureDataIndices", wintypes.USHORT),
    ]


class HIDP_RANGE(Structure):
    _fields_ = [
        ("UsageMin", wintypes.USHORT),
        ("UsageMax", wintypes.USHORT),
        ("StringMin", wintypes.USHORT),
        ("StringMax", wintypes.USHORT),
        ("DesignatorMin", wintypes.USHORT),
        ("DesignatorMax", wintypes.USHORT),
        ("DataIndexMin", wintypes.USHORT),
        ("DataIndexMax", wintypes.USHORT),
    ]


class HIDP_NOTRANGE(Structure):
    _fields_ = [
        ("Usage", wintypes.USHORT),
        ("Reserved1", wintypes.USHORT),
        ("StringIndex", wintypes.USHORT),
        ("Reserved2", wintypes.USHORT),
        ("DesignatorIndex", wintypes.USHORT),
        ("Reserved3", wintypes.USHORT),
        ("DataIndex", wintypes.USHORT),
        ("Reserved4", wintypes.USHORT),
    ]


class HIDP_CAPS_RANGE_UNION(ctypes.Union):
    _fields_ = [("Range", HIDP_RANGE), ("NotRange", HIDP_NOTRANGE)]


class HIDP_BUTTON_CAPS(Structure):
    _fields_ = [
        ("UsagePage", wintypes.USHORT),
        ("ReportID", ctypes.c_ubyte),
        ("IsAlias", wintypes.BOOLEAN),
        ("BitField", wintypes.USHORT),
        ("LinkCollection", wintypes.USHORT),
        ("LinkUsage", wintypes.USHORT),
        ("LinkUsagePage", wintypes.USHORT),
        ("IsRange", wintypes.BOOLEAN),
        ("IsStringRange", wintypes.BOOLEAN),
        ("IsDesignatorRange", wintypes.BOOLEAN),
        ("IsAbsolute", wintypes.BOOLEAN),
        ("Reserved", wintypes.ULONG * 10),
        ("u", HIDP_CAPS_RANGE_UNION),
    ]


HidP_Input = 0

hid.HidD_GetPreparsedData.argtypes = [wintypes.HANDLE, POINTER(ctypes.c_void_p)]
hid.HidD_GetPreparsedData.restype = wintypes.BOOLEAN
hid.HidD_FreePreparsedData.argtypes = [ctypes.c_void_p]
hid.HidD_FreePreparsedData.restype = wintypes.BOOLEAN
hid.HidP_GetCaps.argtypes = [ctypes.c_void_p, POINTER(HIDP_CAPS)]
hid.HidP_GetCaps.restype = ctypes.c_long
hid.HidP_GetButtonCaps.argtypes = [
    ctypes.c_int,
    POINTER(HIDP_BUTTON_CAPS),
    POINTER(wintypes.USHORT),
    ctypes.c_void_p,
]
hid.HidP_GetButtonCaps.restype = ctypes.c_long

kernel32.CreateFileW.restype = wintypes.HANDLE


def open_path(path: str):
    handle = kernel32.CreateFileW(
        path,
        GENERIC_READ | GENERIC_WRITE,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        None,
        OPEN_EXISTING,
        FILE_FLAG_OVERLAPPED,
        None,
    )
    return handle


def main() -> None:
    import hid as hidapi

    for d in hidapi.enumerate():
        if int(d.get("vendor_id") or 0) != 0x248A:
            continue
        path = d["path"]
        if isinstance(path, bytes):
            path_s = path.decode("utf-8", "ignore")
        else:
            path_s = str(path)
        print("=" * 72)
        print(
            f"up={int(d.get('usage_page') or 0):04X} us={int(d.get('usage') or 0):04X} "
            f"iface={d.get('interface_number')}"
        )
        print(path_s)
        h = open_path(path_s)
        if h == INVALID_HANDLE_VALUE or not h:
            print("  CreateFile failed", ctypes.get_last_error())
            continue
        prep = ctypes.c_void_p()
        if not hid.HidD_GetPreparsedData(h, byref(prep)):
            print("  HidD_GetPreparsedData failed")
            kernel32.CloseHandle(h)
            continue
        caps = HIDP_CAPS()
        hid.HidP_GetCaps(prep, byref(caps))
        print(
            f"  UsagePage={caps.UsagePage:04X} Usage={caps.Usage:04X} "
            f"in={caps.InputReportByteLength} out={caps.OutputReportByteLength} "
            f"feat={caps.FeatureReportByteLength}"
        )
        print(
            f"  input buttons={caps.NumberInputButtonCaps} values={caps.NumberInputValueCaps} "
            f"indices={caps.NumberInputDataIndices}"
        )
        n = wintypes.USHORT(caps.NumberInputButtonCaps)
        if n.value:
            arr = (HIDP_BUTTON_CAPS * n.value)()
            hid.HidP_GetButtonCaps(HidP_Input, arr, byref(n), prep)
            for i in range(n.value):
                b = arr[i]
                if b.IsRange:
                    usage = f"{b.u.Range.UsageMin:04X}-{b.u.Range.UsageMax:04X}"
                else:
                    usage = f"{b.u.NotRange.Usage:04X}"
                print(
                    f"  button rid={b.ReportID} page={b.UsagePage:04X} usage={usage} "
                    f"link={b.LinkUsagePage:04X}/{b.LinkUsage:04X}"
                )
        hid.HidD_FreePreparsedData(prep)
        kernel32.CloseHandle(h)


if __name__ == "__main__":
    main()
