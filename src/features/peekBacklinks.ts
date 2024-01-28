// https://github.com/microsoft/vscode-extension-samples/blob/main/webview-view-sample

import { CancellationToken, Disposable, ExtensionContext, TextEditor, Uri, WebviewView, WebviewViewProvider, WebviewViewResolveContext, commands, window, workspace } from "vscode";
import { Block, LinkType, Page, PageLink } from "../core";
import { getOpenFileCommandUri, getPageName, isSupportedFile } from "../utils";

export function activate(context: ExtensionContext, cortex: Map<string, Page>)
{
    const provider = new PeekBacklinksViewProvider(cortex);

    context.subscriptions.push(
        window.registerWebviewViewProvider(
            'cortex-notes.peek-backlinks',
            provider));
}

class PeekBacklinksViewProvider implements WebviewViewProvider {

    private _webviewView: WebviewView | undefined;
    private _subscription: Disposable;
    private _defaultMessage = "<h2>Open a cortex document to show it's backlinks.</h2>";

    constructor(private cortex: Map<string, Page>) {

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

                        a {
                            text-decoration: none;
                        }

                        .source-page-title a {
                            color: #2aa198;
                        }

                        .source-page-title-row {
                            background-color: #00000033;
                            display: block;
                            padding: 0.3em;
                        }

                        .page-link-indicator {
                            color: #004354;
                            font-weight: bold;
                            font-size: 1.2em;
                            letter-spacing: 0.1em;
                        }

                        .page-link-name a {
                            color: #2aa198;
                            font-weight: bold;
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

        const page = this.cortex.get(getPageName(uri));

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
        let consumedBlocks = new Set<Block>();

        for (const backlinksGroup of sortedBacklinksGroups) {

            const sourcePage = backlinksGroup[0];
            const sourcePageUri = sourcePage.uri!;

            // append backlink source's URI as link to the text response
            const workspaceFolderUri = workspace
                .getWorkspaceFolder(sourcePageUri)?.uri!;
       
            const title = sourcePage.name;
            const relativeUri = sourcePageUri.path.replace(workspaceFolderUri.path, '');

            if (responseLines.length > 0) {
                responseLines.push('');
            }

            const openFileCommandUri = getOpenFileCommandUri(sourcePageUri);

            responseLines.push(`<span class="source-page-title-row">**<span class="source-page-title">[${title}](${openFileCommandUri})</span> ${relativeUri.substring(0, relativeUri.length - title.length - 3)}**</span>`);
            responseLines.push('');

            // loop over each backlink
            const document = await workspace.openTextDocument(sourcePageUri);
            const backlinks = backlinksGroup[1];

            for (const backlink of backlinks) {

                // find block containing link
                for (const block of sourcePage.blocks) {

                    if (!block.range.contains(backlink.range) || consumedBlocks.has(block)) {
                        continue;
                    }

                    // make page links real links
                    const blockStartOffset = document.offsetAt(block.range.start);
                    let blockText = document.getText(block.range);
                    let offsetDueToEdit = 0;

                    for (const link of block.links) {

                        if (link.target.uri) {

                            const linkStartOffset = document.offsetAt(link.range.start) - blockStartOffset + offsetDueToEdit;
                            const linkEndOffset = document.offsetAt(link.range.end) - blockStartOffset + offsetDueToEdit;

                            const prefix = blockText.substring(0, linkStartOffset);
                            const suffix = blockText.substring(linkEndOffset);
                            const openFileCommandUri = getOpenFileCommandUri(link.target.uri);

                            const previousResultLength = blockText.length;

                            let linkContent: string;

                            switch (link.type) {

                                case LinkType.Wikilink:

                                    linkContent = blockText.substring(linkStartOffset + 2, linkEndOffset - 2);
                                    blockText = `${prefix}<span class="page-link-indicator">[[</span><span class="page-link-name">[${linkContent}](${openFileCommandUri})</span><span class="page-link-indicator">]]</span>${suffix}`;
                                    break;
                            
                                case LinkType.Hashtag:
                                
                                    linkContent = blockText.substring(linkStartOffset + 1, linkEndOffset);
                                    blockText = `${prefix}<span class="page-link-indicator">#</span><span class="page-link-name">[${linkContent}](${openFileCommandUri})</span>${suffix}`;
                                    break;
                                    
                                default:
                                    break;
                            }

                            offsetDueToEdit += blockText.length - previousResultLength;
                        }
                    }
                    
                    responseLines.push(blockText);
                    
                    consumedBlocks.add(block);
                }
            }
        }

        if (responseLines.length === 0) {
            responseLines.push('There are no backlinks to peek.');
        }

        // format page links
        const response = responseLines.join('\n');

        return response;
    }
}