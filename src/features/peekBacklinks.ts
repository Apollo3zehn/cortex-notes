// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-view-sample

import { CancellationToken, ExtensionContext, WebviewView, WebviewViewProvider, WebviewViewResolveContext, window } from "vscode";
import { Page } from "../global";

class PeekBacklinksViewProvider implements WebviewViewProvider {

    resolveWebviewView(
        webviewView: WebviewView,
        context: WebviewViewResolveContext<unknown>,
        token: CancellationToken): void | Thenable<void> {
        
        webviewView.webview.html = "<h1>Hello!</h1>";
    }
}

export function activate(context: ExtensionContext, cortex: Map<string, Page>)
{
    const provider = new PeekBacklinksViewProvider();

    context.subscriptions.push(
        window.registerWebviewViewProvider(
            'cortex-notes.peek-backlinks',
            provider));
}