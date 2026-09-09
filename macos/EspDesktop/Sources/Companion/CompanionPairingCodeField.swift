import AppKit
import SwiftUI

/// Keeps empty positions when editing a code, so deleting a letter never shifts its neighbours.
struct PairingCodeEntry {
    var letters = Array(repeating: "", count: 8)

    mutating func replace(at index: Int, with input: String) -> Int {
        if input.isEmpty {
            letters[index] = ""
            return index
        }
        if let code = CompanionPairingInput.normalizedCode(input) {
            letters = code.filter { $0 != "-" }.map(String.init)
            return 7
        }
        let scalars = Array(input.unicodeScalars)
        guard scalars.allSatisfy({ (65...90).contains($0.value) || (97...122).contains($0.value) }),
              scalars.count <= 8 - index else { return index }
        for (offset, letter) in input.uppercased().enumerated() {
            letters[index + offset] = String(letter)
        }
        return min(index + scalars.count, 7)
    }

    var code: String { letters.joined() }
}

struct CompanionPairingCodeField: View {
    @Binding var code: String
    let onSubmit: () -> Void
    @State private var entry = PairingCodeEntry()
    @State private var focusedIndex = 0

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<8, id: \.self) { index in
                if index == 4 {
                    Text("–").foregroundStyle(.secondary).accessibilityHidden(true)
                }
                PairingLetterField(
                    letter: entry.letters[index],
                    index: index,
                    focused: focusedIndex == index,
                    onFocus: { focusedIndex = index },
                    onEdit: { text in
                        focusedIndex = entry.replace(at: index, with: text)
                        code = entry.code
                        return (entry.letters[index], focusedIndex)
                    },
                    onMove: { direction in focusedIndex = min(max(index + direction, 0), 7) },
                    onSubmit: onSubmit
                )
                .frame(maxWidth: .infinity)
                .frame(height: 30)
                .frame(height: 52)
                .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 9))
                .overlay {
                    RoundedRectangle(cornerRadius: 9)
                        .strokeBorder(focusedIndex == index ? Color.accentColor : Color.primary.opacity(0.15), lineWidth: focusedIndex == index ? 2 : 1)
                }
            }
        }
        .onAppear {
            if !code.isEmpty { focusedIndex = entry.replace(at: 0, with: code) }
        }
    }
}

private struct PairingLetterField: NSViewRepresentable {
    let letter: String
    let index: Int
    let focused: Bool
    let onFocus: () -> Void
    let onEdit: (String) -> (letter: String, next: Int)
    let onMove: (Int) -> Void
    let onSubmit: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> NSTextField {
        let field = NSTextField()
        field.identifier = NSUserInterfaceItemIdentifier("pairing-letter-\(index)")
        field.isBordered = false
        field.drawsBackground = false
        field.focusRingType = .none
        field.alignment = .center
        field.font = .monospacedSystemFont(ofSize: 24, weight: .medium)
        field.delegate = context.coordinator
        field.setAccessibilityLabel("Pairing code, letter \(index + 1) of 8")
        field.setAccessibilityHelp("Type a letter or paste the entire eight-letter pairing code.")
        return field
    }

    func updateNSView(_ field: NSTextField, context: Context) {
        context.coordinator.parent = self
        if field.stringValue != letter { field.stringValue = letter }
        if focused && field.currentEditor() == nil {
            DispatchQueue.main.async { [weak field, weak coordinator = context.coordinator] in
                guard let field, coordinator?.parent.focused == true else { return }
                field.window?.makeFirstResponder(field)
                field.selectText(nil)
            }
        }
    }

    @MainActor final class Coordinator: NSObject, NSTextFieldDelegate {
        var parent: PairingLetterField
        init(_ parent: PairingLetterField) { self.parent = parent }
        func controlTextDidBeginEditing(_ notification: Notification) {
            parent.onFocus()
            (notification.object as? NSTextField)?.currentEditor()?.selectAll(nil)
        }
        func controlTextDidChange(_ notification: Notification) {
            guard let field = notification.object as? NSTextField else { return }
            let result = parent.onEdit(field.stringValue)
            field.stringValue = result.letter
            // Move the native editor immediately, so fast typing cannot land in the previous box.
            if result.next != parent.index { moveFocus(from: field, to: result.next) }
        }
        private func moveFocus(from control: NSControl, to index: Int) {
            let identifier = NSUserInterfaceItemIdentifier("pairing-letter-\(index)")
            @MainActor func find(in view: NSView) -> NSTextField? {
                if view.identifier == identifier { return view as? NSTextField }
                for child in view.subviews {
                    if let field = find(in: child) { return field }
                }
                return nil
            }
            guard let root = control.window?.contentView, let next = find(in: root) else { return }
            control.window?.makeFirstResponder(next)
            next.selectText(nil)
        }
        func control(_ control: NSControl, textView: NSTextView, doCommandBy command: Selector) -> Bool {
            switch command {
            case #selector(NSResponder.deleteBackward(_:)) where textView.string.isEmpty:
                parent.onMove(-1)
                moveFocus(from: control, to: max(parent.index - 1, 0))
            case #selector(NSResponder.moveLeft(_:)):
                parent.onMove(-1)
                moveFocus(from: control, to: max(parent.index - 1, 0))
            case #selector(NSResponder.moveRight(_:)):
                parent.onMove(1)
                moveFocus(from: control, to: min(parent.index + 1, 7))
            case #selector(NSResponder.insertNewline(_:)): parent.onSubmit()
            default: return false
            }
            return true
        }
    }
}
