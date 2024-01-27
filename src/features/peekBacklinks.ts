// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-view-sample

import { CancellationToken, Disposable, ExtensionContext, TextDocument, TextEditor, Uri, WebviewView, WebviewViewProvider, WebviewViewResolveContext, commands, window, workspace } from "vscode";
import { Page, PageLink } from "../core";
import { getPageName, isSupportedFile } from "../utils";

export function activate(context: ExtensionContext, cortex: Map<string, Page>)
{
    const provider = new PeekBacklinksViewProvider(cortex);

    context.subscriptions.push(
        window.registerWebviewViewProvider(
            'cortex-notes.peek-backlinks',
            provider));
}

interface LinkedPageDetails {
    titleLength: number;
    startLine: number;
    endLine: number;
    minLine: number;
}

class PeekBacklinksViewProvider implements WebviewViewProvider {

    private _cortex: Map<string, Page>;
    private _pageToLinkedPageDetailsMap = new Map<Uri, Map<TextDocument, LinkedPageDetails>>();
    private _webviewView: WebviewView | undefined;
    private _subscription: Disposable;
    private _defaultMessage = "<h2>Open a cortex document to show it's backlinks.</h2>";

    constructor(cortex: Map<string, Page>) {
        this._cortex = cortex;

        // ensure that the peek document content is updated when the user opens another wiki document
        this._subscription = window.onDidChangeActiveTextEditor(this.updateView, this);
    }

    resolveWebviewView(
        webviewView: WebviewView,
        _context: WebviewViewResolveContext<unknown>,
        _token: CancellationToken): void | Thenable<void> {

        webviewView.webview.html = this._defaultMessage;

        webviewView.webview.options = {
            enableCommandUris: true
        };

        this._webviewView = webviewView;

        // update document now
        const _ = this.updateView(window.activeTextEditor);
    }

    dispose() {
        this._subscription.dispose();
    }

    private async updateView(editor: TextEditor | undefined) {

        if (!this._webviewView) {
            return;
        }

        if (!(editor && isSupportedFile(editor.document))) {
            this._webviewView.webview.html = this._defaultMessage;
            return;
        }

        // capture the current wiki document for later use
        // https://github.com/microsoft/vscode/issues/75612
        const markdownString = await this.buildMarkdown(editor.document.uri);
        const body = await commands.executeCommand<string>('markdown.api.render', markdownString);
        
        this._webviewView.webview.html = `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body {
                            color: #839496;
                            font-size: 1em;
                        }

                        body::before {
                            content: "";
                            background-image: url("https://svgsilh.com/svg/155655.svg");
                            background-size: cover;
                            position: absolute;
                            top: 0px;
                            right: 0px;
                            bottom: 0px;
                            left: 0px;
                            opacity: 0.04;
                            pointer-events: none;
                        }

                        .source-page-title a {
                            color: #2aa198
                        }

                        .source-page-title-row {
                            background-color: #00000033;
                            display: block;
                            padding: 0.3em;
                        }
                    </style>
                </head>
                <body>
                    ${body}
                </body>
            </html>
        `;
    }

    private async buildMarkdown(uri: Uri): Promise<string> {

        const linkedDocDetailsMap = this.getOrCreatePageEntry(uri, /* reset */ true);
        const page = this._cortex.get(getPageName(uri));

        if (!page) {
            return Promise.resolve(this._defaultMessage);
        }

        const backlinks = page.backlinks;
        const responseLines: string[] = [];

        // group backlinks
        var groupedBacklinks = backlinks.reduce((current, backlink) => {

            let pageLinks: PageLink[];

            if (current.has(backlink.source)) {
                pageLinks = current.get(backlink.source)!;
            }
            
            else {
                pageLinks = [];
                current.set(backlink.source, pageLinks);
            }

            pageLinks.push(backlink);

            return current;
        }, new Map<Page, PageLink[]>());

        // sort backlinks group by source name
        const sortedBacklinksGroups = Array
            .from(groupedBacklinks.entries())
            .sort((sourceA, sourceB) => {
                const sourceNameA = sourceA[0].name;
                const sourceNameB = sourceB[0].name;

                return sourceNameA.localeCompare(sourceNameB);
            });

        // loop over each backlinks group and build up text response
        let currentLine = 0;

        for (const backlinksGroup of sortedBacklinksGroups) {

            // get or create 'linkedPageDetails'
            let linkedPageDetails: LinkedPageDetails;
            const sourcePage = backlinksGroup[0];
            const sourcePageUri = sourcePage.uri!;
            const document = await workspace.openTextDocument(sourcePageUri);

            if (linkedDocDetailsMap.has(document)) {

                linkedPageDetails = linkedDocDetailsMap.get(document)!;

            } else {

                // append backlink source's URI to the text response
                const workspaceFolderUri = workspace
                    .getWorkspaceFolder(sourcePageUri)?.uri!;
               
                const title = sourcePage.name;
                const relativeUri = sourcePageUri.path.replace(workspaceFolderUri.path, '');

                if (responseLines.length > 0) {
                    responseLines.push('');
                    currentLine++;
                }

                linkedPageDetails = {
                    titleLength: title.length,
                    startLine: currentLine,
                    endLine: undefined!,
                    minLine: 0,
                };

                linkedDocDetailsMap.set(document, linkedPageDetails);
               
                const stageCommandUri = Uri.parse(
                    `command:vscode.open?${encodeURIComponent(JSON.stringify(sourcePageUri))}`
                );

                responseLines.push(`<span class="source-page-title-row">**<span class="source-page-title">[${title}](${stageCommandUri})</span> ${relativeUri.substring(0, relativeUri.length - title.length - 3)}**</span>`);
                responseLines.push('');

                currentLine += 2;
            }

            // loop over each backlink
            let backlinks = backlinksGroup[1];

            for (const backlink of backlinks) {

                // append wiki doc content to the text response
                const backlinkLine = backlink.range.start.line;

                currentLine += PeekBacklinksViewProvider.appendLeading(
                    document,
                    backlinkLine,
                    linkedPageDetails,
                    responseLines
                );

                currentLine += PeekBacklinksViewProvider.appendMatch(
                    document,
                    backlinkLine,
                    linkedPageDetails,
                    responseLines
                );

                currentLine += PeekBacklinksViewProvider.appendTrailing(
                    document,
                    backlinkLine,
                    linkedPageDetails,
                    responseLines
                );

                linkedPageDetails.endLine = currentLine;
            }
        }

        if (responseLines.length === 0) {
            responseLines.push('There are no backlinks to peek.');
        }

        return responseLines.join('\n');
    }

    // helper methods
    private getOrCreatePageEntry(currentPageUri: Uri, reset: boolean = false): Map<TextDocument, LinkedPageDetails> {

        if (reset || !this._pageToLinkedPageDetailsMap.has(currentPageUri)) {
            this._pageToLinkedPageDetailsMap.set(
                currentPageUri,
                new Map<TextDocument, LinkedPageDetails>()
            );
        }

        return this._pageToLinkedPageDetailsMap.get(currentPageUri)!;
    }

    private static appendLeading(
        doc: TextDocument,
        backlinkLine: number,
        linkDocDetails: LinkedPageDetails,
        responseLines: string[]
    ): number {
        
        const minLine = linkDocDetails.minLine;
        let fromRequested: number;
        
        if (doc.lineAt(backlinkLine).text.startsWith("-")) {
            return 0;
        }

        fromRequested = 0;
            
        for (let i = backlinkLine - 1; i >= 0; i--) {
            if (doc.lineAt(i).text.startsWith("-")) {
                fromRequested = i;
                break;
            }
        }

        const from = Math.max(minLine, fromRequested);
        const to = backlinkLine;
        let lineCount = 0;

        if (fromRequested >= minLine && minLine !== 0) {
            responseLines.push('...');
            lineCount++;
        }

        for (let i = from; i < to; i++) {
            const text = doc.lineAt(i).text;

            responseLines.push(text);
            lineCount++;
            linkDocDetails.minLine = i + 1;
        }

        return lineCount;
    }

    private static appendMatch(
        doc: TextDocument,
        backlinkLine: number,
        linkDocDetails: LinkedPageDetails,
        responseLines: string[]
    ) {
        if (backlinkLine < linkDocDetails.minLine) {
            return 0;
        }

        const text = doc.lineAt(backlinkLine).text;
        responseLines.push(text);
        linkDocDetails.minLine = backlinkLine + 1;

        return 1;
    }

    private static appendTrailing(
        doc: TextDocument,
        backlinkLine: number,
        linkDocDetails: LinkedPageDetails,
        responseLines: string[]
    ): number {
        const minLine = linkDocDetails.minLine;
        const from = Math.max(minLine, backlinkLine);
        let to: number;

        to = doc.lineCount;
        
        for (let i = backlinkLine + 1; i < doc.lineCount; i++) {
            if (doc.lineAt(i).text.startsWith("-")) {
                to = i - 1;
                break;
            };
        }

        let lineCount = 0;

        for (let i = from; i < to; i++) {
            const text = doc.lineAt(i).text;

            responseLines.push(text);
            lineCount++;
            linkDocDetails.minLine = i + 1;
        }

        return lineCount;
    }
}