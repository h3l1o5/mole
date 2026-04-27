// Spike: replace `pngpaste -` with Bun FFI calls into AppKit's NSPasteboard.
//
// Usage (on macOS):
//   1. Copy an image to the clipboard (Cmd+Ctrl+Shift+4 to screenshot, or any
//      image copied from a browser/Finder).
//   2. bun run scripts/pngpaste-spike.ts > /tmp/spike.png
//      pngpaste /tmp/ref.png
//      cmp /tmp/spike.png /tmp/ref.png   # should be byte-identical
//   3. Empty clipboard case:
//      pbcopy < /dev/null
//      bun run scripts/pngpaste-spike.ts ; echo "exit=$?"
//      pngpaste -                        ; echo "exit=$?"
//      # both should be exit=1, no stdout

import { dlopen, FFIType, toArrayBuffer } from 'bun:ffi';

// AppKit must be loaded so the Objective-C runtime knows about NSPasteboard.
// Bun's dlopen requires at least one symbol; NSApplicationLoad is a stable
// C export we declare just to force the framework into the process.
dlopen('/System/Library/Frameworks/AppKit.framework/AppKit', {
  NSApplicationLoad: { args: [], returns: FFIType.bool },
});

const objc = dlopen('/usr/lib/libobjc.A.dylib', {
  objc_getClass: { args: [FFIType.cstring], returns: FFIType.ptr },
  sel_registerName: { args: [FFIType.cstring], returns: FFIType.ptr },
  // Single permissive signature. Pointer-sized args go in registers per the
  // System V / arm64 ABI; the callee reads only what its actual selector
  // signature declares, so over-declaring trailing args is harmless.
  objc_msgSend: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
}).symbols;

const cstr = (s: string) => Buffer.from(s + '\0', 'utf8');

const NSPasteboard = objc.objc_getClass(cstr('NSPasteboard'));
const NSString = objc.objc_getClass(cstr('NSString'));
if (!NSPasteboard || !NSString) {
  process.stderr.write('objc_getClass returned null (AppKit not loaded?)\n');
  process.exit(2);
}

const sel = (name: string) => objc.sel_registerName(cstr(name));
const SEL_generalPasteboard = sel('generalPasteboard');
const SEL_dataForType = sel('dataForType:');
const SEL_stringWithUTF8String = sel('stringWithUTF8String:');
const SEL_bytes = sel('bytes');
const SEL_length = sel('length');

const pb = objc.objc_msgSend(NSPasteboard, SEL_generalPasteboard, null);

// NSPasteboardTypePNG is the UTI string "public.png".
const pngType = objc.objc_msgSend(
  NSString,
  SEL_stringWithUTF8String,
  cstr('public.png'),
);

const data = objc.objc_msgSend(pb, SEL_dataForType, pngType);
if (!data) {
  // Matches `pngpaste -` behavior: nothing on stdout, non-zero exit.
  process.exit(1);
}

const length = Number(objc.objc_msgSend(data, SEL_length, null));
const bytesPtr = objc.objc_msgSend(data, SEL_bytes, null);
if (!bytesPtr || length === 0) process.exit(1);

const buf = new Uint8Array(toArrayBuffer(bytesPtr, 0, length));
process.stdout.write(buf);
