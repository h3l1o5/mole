import AppKit

let pb = NSPasteboard.general

if let png = pb.data(forType: .png) {
    FileHandle.standardOutput.write(png)
    exit(0)
}

// TIFF fallback for apps (older Preview, some browsers) that only put TIFF
// on the pasteboard. Matches pngpaste's behavior so callers don't regress.
if let tiff = pb.data(forType: .tiff),
   let rep = NSBitmapImageRep(data: tiff),
   let png = rep.representation(using: .png, properties: [:]) {
    FileHandle.standardOutput.write(png)
    exit(0)
}

exit(1)
