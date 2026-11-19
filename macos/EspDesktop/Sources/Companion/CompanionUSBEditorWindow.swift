import AppKit
@preconcurrency import WebKit

@MainActor
final class CompanionUSBEditorWindow: NSObject, WKNavigationDelegate,
                                      WKURLSchemeHandler, WKScriptMessageHandlerWithReply {
    private static let scheme = "espdesktop-usb"
    private let window: NSWindow
    private let status = NSTextField(labelWithString: "Loading editor from the display…")
    private let exportDraft = NSButton(title: "Export Unsaved Layout…", target: nil, action: nil)
    private var unsavedLayout: USBEditorRequest?
    private let connection: CompanionConnection
    private var webView: WKWebView?
    private var assetRequests: [ObjectIdentifier: Task<Void, Never>] = [:]
    private var scriptRequests: [UUID: Task<Void, Never>] = [:]
    private var editorScript: USBEditorResponse?
    private var assetLoadFailed = false

    init(display: CompanionDisplay) {
        connection = display.connection
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1040, height: 760),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        super.init()
        window.title = "\(display.name) — Device"
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 640, height: 480)

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.setURLSchemeHandler(self, forURLScheme: Self.scheme)
        configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "panel")
        configuration.userContentController.addUserScript(
            WKUserScript(source: Self.fetchBridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let browser = WKWebView(frame: .zero, configuration: configuration)
        browser.navigationDelegate = self
        browser.translatesAutoresizingMaskIntoConstraints = false
        status.translatesAutoresizingMaskIntoConstraints = false
        status.lineBreakMode = .byTruncatingTail
        exportDraft.target = self
        exportDraft.action = #selector(exportUnsavedLayout)
        exportDraft.isHidden = true
        let footer = NSStackView(views: [status, exportDraft])
        footer.translatesAutoresizingMaskIntoConstraints = false
        let content = NSView()
        content.addSubview(browser)
        content.addSubview(footer)
        NSLayoutConstraint.activate([
            browser.topAnchor.constraint(equalTo: content.topAnchor),
            browser.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            browser.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            browser.bottomAnchor.constraint(equalTo: footer.topAnchor, constant: -6),
            footer.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 12),
            footer.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -12),
            footer.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -8),
        ])
        window.contentView = content
        window.center()
        webView = browser
        browser.load(URLRequest(url: URL(string: "\(Self.scheme)://display/")!))
    }

    func open() {
        window.makeKeyAndOrderFront(nil)
        if assetLoadFailed {
            assetLoadFailed = false
            status.stringValue = "Loading editor from the display…"
            webView?.reload()
        }
        NSApp.activate(ignoringOtherApps: true)
    }

    func invalidate() {
        for request in assetRequests.values { request.cancel() }
        for request in scriptRequests.values { request.cancel() }
        webView?.stopLoading()
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "panel", contentWorld: .page)
        webView = nil
        window.contentView = nil
        window.close()
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        decisionHandler(url?.scheme == Self.scheme && url?.host == "display" ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url, url.host == "display" else {
            urlSchemeTask.didFailWithError(USBEditorError.invalidResponse)
            return
        }
        if url.path == "/" || url.path.isEmpty {
            deliver(Data(Self.html.utf8), type: "text/html", to: urlSchemeTask, url: url)
            return
        }
        guard url.path == "/0.js" else {
            urlSchemeTask.didFailWithError(USBEditorError.invalidResponse)
            return
        }
        let id = ObjectIdentifier(urlSchemeTask as AnyObject)
        assetRequests[id] = Task { [weak self] in
            guard let self else { return }
            defer { self.assetRequests[id] = nil }
            do {
                let response: USBEditorResponse
                if let cached = self.editorScript {
                    response = cached
                } else {
                    let request = USBEditorRequest(method: "GET", path: "/0.js")!
                    try await self.waitForCable()
                    response = try await self.connection.requestUSBEditor(request)
                    guard response.status == 200, !response.body.isEmpty else { throw USBEditorError.invalidResponse }
                    self.editorScript = response
                }
                try Task.checkCancellation()
                self.deliver(response.body, type: "text/javascript", to: urlSchemeTask, url: url)
                self.status.stringValue = "USB"
            } catch {
                guard !Task.isCancelled else { return }
                self.assetLoadFailed = true
                self.status.stringValue = error.localizedDescription
                urlSchemeTask.didFailWithError(error)
            }
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {
        assetRequests.removeValue(forKey: ObjectIdentifier(urlSchemeTask as AnyObject))?.cancel()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.scheme == Self.scheme,
              let values = message.body as? [String: Any], let method = values["method"] as? String,
              let path = values["path"] as? String, let encodedBody = values["body"] as? String,
              encodedBody.utf8.count <= 700_000, let body = Data(base64Encoded: encodedBody),
              let request = USBEditorRequest(method: method, path: path,
                                             headers: values["headers"] as? [String: String] ?? [:], body: body)
        else {
            replyHandler(["status": 403, "headers": [:], "body": ""], nil)
            return
        }

        let id = UUID()
        scriptRequests[id] = Task { [weak self] in
            guard let self else { return }
            defer { self.scriptRequests[id] = nil }
            do {
                let response = try await self.perform(request)
                replyHandler(["status": response.status, "headers": response.headers,
                              "body": response.body.base64EncodedString()], nil)
            } catch {
                if !Task.isCancelled {
                    self.status.stringValue = error.localizedDescription
                    if self.unsavedLayout != nil { self.exportDraft.isHidden = false }
                }
                replyHandler(nil, error.localizedDescription)
            }
        }
    }

    private func perform(_ request: USBEditorRequest) async throws -> USBEditorResponse {
        guard request.method == "PUT", request.path == "/api/v1/config" else {
            try await waitForCable()
            return try await connection.requestUSBEditor(request)
        }
        unsavedLayout = request
        try await waitForCable(whileSaving: true)
        let response: USBEditorResponse
        do {
            response = try await connection.requestUSBEditor(request)
        } catch is USBEditorError {
            response = try await recoverSave(request)
        }
        if (200...299).contains(response.status), unsavedLayout?.body == request.body {
            unsavedLayout = nil
            exportDraft.isHidden = true
        } else {
            exportDraft.isHidden = false
        }
        return response
    }

    @objc private func exportUnsavedLayout() {
        guard let draft = unsavedLayout else { return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "Unsaved EspDesktop Layout.bin"
        panel.beginSheetModal(for: window) { [weak self] result in
            guard result == .OK, let url = panel.url else { return }
            do { try draft.body.write(to: url, options: .atomic) }
            catch { self?.status.stringValue = error.localizedDescription }
        }
    }

    private func recoverSave(_ request: USBEditorRequest) async throws -> USBEditorResponse {
        status.stringValue = "Checking what the display saved…"
        let read = USBEditorRequest(method: "GET", path: request.path, headers: request.headers.filter {
            $0.key == "x-panel-config-version"
        })!
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: .seconds(120))
        while clock.now < deadline {
            do {
                try await waitForCable(whileSaving: true)
                let current = try await connection.requestUSBEditor(read)
                guard current.status == 200 else { return current }
                switch current.decideInterruptedSave(request) {
                case .confirmed:
                    status.stringValue = "USB — saved layout confirmed"
                    return current
                case .conflict:
                    status.stringValue = "The display layout changed. Your edits weren’t sent again."
                    return USBEditorResponse(status: 412, headers: [:], body: Data())
                case .retry:
                    let saved = try await connection.requestUSBEditor(request)
                    status.stringValue = "USB"
                    return saved
                }
            } catch USBEditorError.disconnected {
                continue
            } catch USBEditorError.timedOut {
                try await Task.sleep(for: .milliseconds(300))
            }
        }
        throw USBEditorError.timedOut
    }

    private func waitForCable(whileSaving: Bool = false) async throws {
        let clock = ContinuousClock()
        let end = clock.now.advanced(by: .seconds(90))
        while !connection.usbEditorConnected {
            guard whileSaving || clock.now < end else { throw USBEditorError.disconnected }
            status.stringValue = whileSaving ? "Save paused. Reconnect USB to check what the display saved."
                : "USB disconnected. Reconnect the cable to continue."
            try await Task.sleep(for: .milliseconds(250))
        }
        status.stringValue = "USB"
    }

    private func deliver(_ body: Data, type: String, to task: any WKURLSchemeTask, url: URL) {
        task.didReceive(URLResponse(url: url, mimeType: type, expectedContentLength: body.count, textEncodingName: "utf-8"))
        task.didReceive(body)
        task.didFinish()
    }

    private static let html = """
    <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src espdesktop-usb: 'unsafe-inline';
     style-src 'unsafe-inline'; img-src data: blob: espdesktop-usb:; font-src data: blob:; connect-src 'none'">
    </head><body><esp-app></esp-app><script src="/0.js"></script></body></html>
    """

    private static let fetchBridge = """
    (() => {
      // The embedded editor falls back to its snapshot reader without SSE.
      window.EventSource = undefined;
      window.fetch = async (input, init = {}) => {
        const url = new URL(input instanceof Request ? input.url : input, window.location.href);
        if (url.protocol !== 'espdesktop-usb:' || url.hostname !== 'display')
          throw new TypeError('The USB editor is offline.');
        if (init.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
        const headers = Object.fromEntries(new Headers(init.headers ?? (input instanceof Request ? input.headers : {})));
        let body = '';
        if (init.body != null) {
          const bytes = new Uint8Array(await new Response(init.body).arrayBuffer());
          let binary = '';
          for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          body = btoa(binary);
        }
        const reply = await window.webkit.messageHandlers.panel.postMessage({
          method: init.method ?? (input instanceof Request ? input.method : 'GET'),
          path: url.pathname + url.search, headers, body
        });
        if (init.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
        const bytes = Uint8Array.from(atob(reply.body), c => c.charCodeAt(0));
        return new Response([204, 205, 304].includes(reply.status) ? null : bytes,
          { status: reply.status, headers: reply.headers });
      };
    })();
    """
}
