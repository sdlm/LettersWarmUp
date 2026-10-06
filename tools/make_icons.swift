// One-off icon generator for the PWA manifest and the iOS home screen.
// Not part of the build: run it by hand from the repository root when the
// icon should change, then commit the PNGs in src/icons/.
//
//   swift tools/make_icons.swift

import AppKit

let background = NSColor(srgbRed: 0x11 / 255.0, green: 0x11 / 255.0, blue: 0x11 / 255.0, alpha: 1)
let foreground = NSColor.white
let label = "Аа"

let outputs: [(size: Int, name: String)] = [
    (192, "icon-192.png"),
    (512, "icon-512.png"),
    (180, "apple-touch-icon.png"),
]

func render(size: Int) -> Data {
    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: size,
        pixelsHigh: size,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else {
        fatalError("make_icons: could not allocate a \(size)px bitmap")
    }
    let side = CGFloat(size)
    rep.size = NSSize(width: side, height: side)

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

    background.setFill()
    NSRect(x: 0, y: 0, width: side, height: side).fill()

    let font = NSFont.systemFont(ofSize: side * 0.42, weight: .heavy)
    let text = NSAttributedString(
        string: label,
        attributes: [.font: font, .foregroundColor: foreground]
    )
    let textSize = text.size()
    text.draw(at: NSPoint(x: (side - textSize.width) / 2, y: (side - textSize.height) / 2))

    NSGraphicsContext.restoreGraphicsState()

    guard let png = rep.representation(using: .png, properties: [:]) else {
        fatalError("make_icons: could not encode a \(size)px PNG")
    }
    return png
}

let directory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    .appendingPathComponent("src/icons")
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

for output in outputs {
    let url = directory.appendingPathComponent(output.name)
    try render(size: output.size).write(to: url)
    print("Wrote \(url.path) (\(output.size)x\(output.size))")
}
