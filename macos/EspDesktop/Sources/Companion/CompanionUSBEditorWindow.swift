import AppKit
import UniformTypeIdentifiers
@preconcurrency import WebKit

@MainActor
final class CompanionUSBEditorWindow: NSObject, WKNavigationDelegate, WKUIDelegate,
                                      WKURLSchemeHandler, WKScriptMessageHandlerWithReply {
    private static let scheme = "espdesktop-usb"
    private let window: NSWindow
    private let status = NSTextField(labelWithString: "USB")
    private let loading = NSView()
    private let loadingStatus = NSTextField(wrappingLabelWithString: "")
    private let loadingIndicator = NSProgressIndicator()
    private let retryButton = NSButton(title: "Retry", target: nil, action: nil)
    private let exportDraft = NSButton(title: "Export Unsaved Layout…", target: nil, action: nil)
    private var unsavedLayout: USBEditorRequest?
    private let connection: CompanionConnection
    private var webView: WKWebView?
    private var assetRequests: [ObjectIdentifier: Task<Void, Never>] = [:]
    private var scriptRequests: [UUID: Task<Void, Never>] = [:]
    private var editorScript: USBEditorResponse?
    private var assetLoadFailed = false
    private var webChallenge: USBEditorWebChallenge?
    private var webCredentials: USBEditorWebCredentials?
    private var webSignIn: Task<USBEditorWebCredentials?, Never>?

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
        browser.uiDelegate = self
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
        content.addSubview(loading)
        content.addSubview(footer)
        loading.translatesAutoresizingMaskIntoConstraints = false
        loading.wantsLayer = true
        loading.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
        loadingStatus.alignment = .center
        loadingIndicator.style = .spinning
        retryButton.target = self
        retryButton.action = #selector(loadEditor)
        let loadingStack = NSStackView(views: [loadingIndicator, loadingStatus, retryButton])
        loadingStack.orientation = .vertical
        loadingStack.alignment = .centerX
        loadingStack.spacing = 12
        loadingStack.translatesAutoresizingMaskIntoConstraints = false
        loading.addSubview(loadingStack)
        NSLayoutConstraint.activate([
            browser.topAnchor.constraint(equalTo: content.topAnchor),
            browser.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            browser.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            browser.bottomAnchor.constraint(equalTo: footer.topAnchor, constant: -6),
            footer.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 12),
            footer.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -12),
            footer.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -8),
            loading.topAnchor.constraint(equalTo: browser.topAnchor),
            loading.leadingAnchor.constraint(equalTo: browser.leadingAnchor),
            loading.trailingAnchor.constraint(equalTo: browser.trailingAnchor),
            loading.bottomAnchor.constraint(equalTo: browser.bottomAnchor),
            loadingStack.centerXAnchor.constraint(equalTo: loading.centerXAnchor),
            loadingStack.centerYAnchor.constraint(equalTo: loading.centerYAnchor),
            loadingStack.widthAnchor.constraint(lessThanOrEqualToConstant: 400),
        ])
        window.contentView = content
        window.center()
        webView = browser
        loadEditor()
    }

    func open() {
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func loadEditor() {
        assetLoadFailed = false
        loading.isHidden = false
        retryButton.isHidden = true
        loadingIndicator.isHidden = false
        loadingIndicator.startAnimation(nil)
        loadingStatus.stringValue = "Loading editor over USB…"
        webView?.load(URLRequest(url: URL(string: "\(Self.scheme)://display/")!))
    }

    private func showLoadError(_ error: Error) {
        assetLoadFailed = true
        loadingStatus.stringValue = error.localizedDescription
        loadingIndicator.stopAnimation(nil)
        loadingIndicator.isHidden = true
        retryButton.isHidden = false
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !assetLoadFailed else { return }
        loadingIndicator.stopAnimation(nil)
        loading.isHidden = true
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showLoadError(error)
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

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable ([URL]?) -> Void) {
        guard frame.isMainFrame, frame.request.url?.scheme == Self.scheme, frame.request.url?.host == "display",
              window.attachedSheet == nil else {
            completionHandler(nil)
            return
        }
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.json]
        panel.beginSheetModal(for: window) { result in
            completionHandler(result == .OK ? panel.urls : nil)
        }
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
                    try await self.waitForCable(whileLoading: true)
                    response = try await self.requestPanel(request)
                    guard response.status == 200, !response.body.isEmpty else { throw USBEditorError.invalidResponse }
                    self.editorScript = response
                }
                try Task.checkCancellation()
                self.deliver(response.body, type: "text/javascript", to: urlSchemeTask, url: url)
                self.status.stringValue = "USB"
            } catch {
                guard !Task.isCancelled else { return }
                self.showLoadError(error)
                urlSchemeTask.didFailWithError(error)
            }
        }
    }

    private func requestPanel(_ request: USBEditorRequest) async throws -> USBEditorResponse {
        let previousCredentials = webCredentials
        let initialAuthorization = previousCredentials.flatMap {
            webChallenge?.authorization(for: request, credentials: $0)
        }
        let first = try await connection.requestUSBEditor(request, authorization: initialAuthorization)
        guard first.status == 401 else { return first }
        guard let challenge = USBEditorWebChallenge(first.headers["www-authenticate"]) else {
            throw USBEditorSignInError.required
        }
        webChallenge = challenge
        if initialAuthorization != nil && !challenge.stale && webCredentials == previousCredentials {
            webCredentials = nil
        }
        if webCredentials == nil {
            let credentials = await promptForWebCredentials()
            try Task.checkCancellation()
            webCredentials = credentials
        }
        guard let credentials = webCredentials else { throw USBEditorSignInError.required }
        guard let authorization = webChallenge?.authorization(for: request, credentials: credentials) else {
            webCredentials = nil
            throw USBEditorSignInError.rejected
        }
        let response = try await connection.requestUSBEditor(request, authorization: authorization)
        if response.status == 401 {
            if webCredentials == credentials { webCredentials = nil }
            throw USBEditorSignInError.rejected
        }
        return response
    }

    private func promptForWebCredentials() async -> USBEditorWebCredentials? {
        if let webSignIn { return await webSignIn.value }
        guard window.isVisible, window.attachedSheet == nil else { return nil }
        let alert = NSAlert()
        alert.messageText = "Sign in to the display"
        alert.informativeText = "Enter the username and password for this display’s web editor."
        alert.addButton(withTitle: "Sign In")
        alert.addButton(withTitle: "Cancel")
        let username = NSTextField(frame: NSRect(x: 0, y: 33, width: 260, height: 24))
        username.placeholderString = "Username"
        username.setAccessibilityLabel("Username")
        let password = NSSecureTextField(frame: NSRect(x: 0, y: 3, width: 260, height: 24))
        password.placeholderString = "Password"
        password.setAccessibilityLabel("Password")
        let fields = NSView(frame: NSRect(x: 0, y: 0, width: 260, height: 60))
        fields.addSubview(username)
        fields.addSubview(password)
        alert.accessoryView = fields
        alert.window.initialFirstResponder = username
        let prompt = Task {
            await withCheckedContinuation { continuation in
                alert.beginSheetModal(for: window) { result in
                    continuation.resume(returning: result == .alertFirstButtonReturn
                        ? USBEditorWebCredentials(username: username.stringValue, password: password.stringValue) : nil)
                }
            }
        }
        webSignIn = prompt
        defer { webSignIn = nil }
        return await prompt.value
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {
        assetRequests.removeValue(forKey: ObjectIdentifier(urlSchemeTask as AnyObject))?.cancel()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.scheme == Self.scheme,
              message.frameInfo.request.url?.host == "display", let values = message.body as? [String: Any] else {
            replyHandler(nil, "Invalid USB editor request.")
            return
        }
        if let filename = values["backup"] as? String {
            guard let encoded = values["body"] as? String,
                  encoded.utf8.count <= ((USBEditorResponse.maximumBytes + 2) / 3) * 4,
                  let data = Data(base64Encoded: encoded), data.count <= USBEditorResponse.maximumBytes,
                  !data.isEmpty else {
                replyHandler(nil, "The backup is too large or could not be read.")
                return
            }
            let name = URL(fileURLWithPath: filename).lastPathComponent
            saveEditorFile(data, named: name.hasSuffix(".json") ? name : "EspDesktop Backup.json")
            replyHandler(true, nil)
            return
        }
        guard let method = values["method"] as? String,
              let path = values["path"] as? String, let encodedBody = values["body"] as? String,
              encodedBody.utf8.count <= 700_000, let body = Data(base64Encoded: encodedBody),
              let request = USBEditorRequest(method: method, path: path,
                                             headers: values["headers"] as? [String: String] ?? [:], body: body)
        else {
            replyHandler(["status": 403, "headers": [:], "body": ""], nil)
            return
        }
        // Older embedded editors hide their Wi-Fi setting when the route is absent.
        guard request.path != USBEditorRequest.wifiPath else {
            replyHandler(["status": 404, "headers": [:], "body": ""], nil)
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
            return try await requestPanel(request)
        }
        unsavedLayout = request
        try await waitForCable(whileSaving: true)
        let response: USBEditorResponse
        do {
            response = try await requestPanel(request)
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
        saveEditorFile(draft.body, named: "Unsaved EspDesktop Layout.bin")
    }

    private func saveEditorFile(_ data: Data, named name: String) {
        guard window.attachedSheet == nil else { return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = name
        panel.beginSheetModal(for: window) { [weak self] result in
            guard result == .OK, let url = panel.url else { return }
            do { try data.write(to: url, options: .atomic) }
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
                let current = try await requestPanel(read)
                guard current.status == 200 else { return current }
                switch current.decideInterruptedSave(request) {
                case .confirmed:
                    status.stringValue = "USB — saved layout confirmed"
                    return current
                case .conflict:
                    status.stringValue = "The display layout changed. Your edits weren’t sent again."
                    return USBEditorResponse(status: 412, headers: [:], body: Data())
                case .retry:
                    let saved = try await requestPanel(request)
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

    private func waitForCable(whileSaving: Bool = false, whileLoading: Bool = false) async throws {
        let clock = ContinuousClock()
        let end = clock.now.advanced(by: .seconds(90))
        while !connection.usbEditorConnected {
            guard whileSaving || clock.now < end else { throw USBEditorError.disconnected }
            status.stringValue = whileSaving ? "Save paused. Reconnect USB to check what the display saved."
                : "USB disconnected. Reconnect the cable to continue."
            if whileLoading { loadingStatus.stringValue = status.stringValue }
            try await Task.sleep(for: .milliseconds(250))
        }
        status.stringValue = "USB"
        if whileLoading { loadingStatus.stringValue = "Loading editor over USB…" }
    }

    private func deliver(_ body: Data, type: String, to task: any WKURLSchemeTask, url: URL) {
        task.didReceive(URLResponse(url: url, mimeType: type, expectedContentLength: body.count, textEncodingName: "utf-8"))
        task.didReceive(body)
        task.didFinish()
    }

    // Older embedded editors still render a reset card. Leave reset status
    // requests available so their write sessions still track the reset epoch.
    private static let html = """
    <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src espdesktop-usb: 'unsafe-inline';
     style-src 'unsafe-inline'; img-src data: blob: espdesktop-usb:; font-src data: blob:; connect-src 'none'">
    <style>.card:has(.sp-reset-options) { display: none !important; }</style>
    </head><body><esp-app></esp-app><script src="/0.js"></script></body></html>
    """

    private static let fetchBridge = """
    (() => {
      // The embedded editor falls back to its snapshot reader without SSE.
      window.EventSource = undefined;
      const backupBlobs = new Map();
      const createObjectURL = URL.createObjectURL.bind(URL);
      const revokeObjectURL = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = object => {
        const url = createObjectURL(object);
        if (object instanceof Blob && object.type === 'application/json') backupBlobs.set(url, object);
        return url;
      };
      URL.revokeObjectURL = url => {
        backupBlobs.delete(url);
        revokeObjectURL(url);
      };
      const encode = bytes => {
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(binary);
      };
      const saveBackup = async (blob, filename) => {
        try {
          if (blob.size > 8 * 1024 * 1024) throw new Error('The backup is too large.');
          await window.webkit.messageHandlers.panel.postMessage({
            backup: filename, body: encode(new Uint8Array(await blob.arrayBuffer()))
          });
        } catch (error) {
          window.alert(error.message || 'Could not export the backup.');
        }
      };
      window.espdesktopUSBExportBackup = saveBackup;
      // Older embedded editors export by clicking a temporary Blob link.
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function() {
        const blob = backupBlobs.get(this.getAttribute('href'));
        if (blob && this.download.endsWith('.json')) {
          void saveBackup(blob, this.download);
          return;
        }
        click.call(this);
      };
      window.fetch = async (input, init = {}) => {
        const url = new URL(input instanceof Request ? input.url : input, window.location.href);
        if (url.protocol !== 'espdesktop-usb:' || url.hostname !== 'display')
          throw new TypeError('The USB editor is offline.');
        if (init.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
        const headers = Object.fromEntries(new Headers(init.headers ?? (input instanceof Request ? input.headers : {})));
        let body = '';
        if (init.body != null) {
          const bytes = new Uint8Array(await new Response(init.body).arrayBuffer());
          body = encode(bytes);
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
