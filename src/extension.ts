import { ExtensionContext, Range, RelativePattern, TextEditor, Uri, commands, window, workspace } from 'vscode';
import { posix } from 'path';
import { getExcludePatterns } from './settings';

const logger = window.createOutputChannel('Cortex Notes');

class Page {
    constructor(
        public readonly pageName: string,
        public uri: Uri | undefined,
        public uriAsString: string | undefined,
        public readonly links: PageLink[],
        public readonly backlinks: PageLink[]) {
        //
    }
}

class PageLink {
    constructor(
        public readonly source: Page,
        public readonly target: Page,
        public readonly range: Range,
        public readonly type: LinkType) {
        //
    }
}

enum LinkType {
    Wikilink,
    Hashtag,
    Todo
}

const _linkDecorationType = window.createTextEditorDecorationType({
    light: {
      backgroundColor: '#02adc422',
    },
    dark: {
      backgroundColor: '#02adc422',
    }
});

export async function activate(context: ExtensionContext) {

    logger.appendLine('Extension activated');

    if (workspace.workspaceFolders === undefined) {
        logger.appendLine('No workspace open, exiting');
        return;
    }

    let disposable = commands.registerCommand('cortex-notes.helloWorld', () => {
        window.showInformationMessage('Hello World from cortex-notes!');
    });

    const cortex = await buildCortex();

    initializeDecorations(context, cortex);

    context.subscriptions.push(disposable);
}

function initializeDecorations(context: ExtensionContext, cortex: Map<string, Page>) {

    // define update decorations method for links
    const updateLinkDecorations = (editor: TextEditor) => {
  
        logger.appendLine(`Update decorations for document ${editor.document.uri}`);

        const ranges: Range[] = [];
        const documentUriAsString = editor.document.uri.toString();
        let page: Page | undefined;

        // TODO maybe create a Map<Uri, Page> for simpler lookup?
        for (const current of cortex.values()) {
            if (current.uriAsString === documentUriAsString) {
                page = current;
                break;
            }
        }

        if (!page) {
            return;
        }

        for (const link of page.links) {
            ranges.push(link.range);
        }
  
        editor.setDecorations(_linkDecorationType, ranges);
    };
    
    // set decorations when document is opened
    window.onDidChangeActiveTextEditor(editor => {
  
        if (!editor) {
            return;
        }

        updateLinkDecorations(editor);
      },
      // TODO: reason for these options?
      null,
      context.subscriptions
    );
  }

async function buildCortex(): Promise<Map<string, Page>> {
    
    const excludePatterns = getExcludePatterns();

    const fileUris = await workspace.findFiles(
        "**/*.md",
        `{${excludePatterns.join(',')}}`
    );

    const cortex = new Map<string, Page>();
    const wikilinkRegex = /\[{2}(.*?)\]{2}/gmd;
    const hashTagsRegex = /(?:^|\s)#([\p{L}\p{Emoji_Presentation}\p{N}/_-]+)/gmud;
    const tasks: Promise<void>[] = [];

    for (const fileUri of fileUris) {

        logger.appendLine(`Processing ${fileUri.toString()}`);

        const task = async () => {

            const document = await workspace.openTextDocument(fileUri);
            const text = document.getText();
            const sourcePageName = getPageName(fileUri);
            const sourcePage = getOrCreatePage(cortex, sourcePageName, fileUri);
            const allMatches: RegExpMatchArray[] = [];

            // wikilinks
            const wikilinkMatches = text.matchAll(wikilinkRegex);

            for (const match of wikilinkMatches) {

                if (!match.indices) {
                    return;
                }

                match.indices[1][0] -= 2;
                match.indices[1][1] += 2;

                allMatches.push(match);
            }

            const hashTagMatches = text.matchAll(hashTagsRegex);

            // hashtags
            for (const match of hashTagMatches) {
                
                if (!match.indices) {
                    return;
                }

                match.indices[1][0] -= 1;

                allMatches.push(match);
            }

            // processing

            for (const match of allMatches) {

                const targetPageName = match[1];
                logger.appendLine(`Found link ${sourcePageName} --> ${targetPageName}`);

                const targetPage = getOrCreatePage(cortex, targetPageName, undefined);
                const indices = match.indices![1];
                const startPos = document.positionAt(indices[0]);
                const endPos = document.positionAt(indices[1]);
                const range = new Range(startPos, endPos);
                const pageLink = new PageLink(sourcePage, targetPage, range, LinkType.Wikilink);

                sourcePage.links.push(pageLink);
                targetPage.backlinks.push(pageLink);
            }
        };

        tasks.push(task());
    }

    await Promise.all(tasks);

    return cortex;
}

function getPageName(uri: Uri): string {
    return changeExtension(posix.basename(uri.fsPath), '*', '');
}

// TODO replace by own implementation (credits go to Foam)
function changeExtension(
    path: string,
    from: string,
    next: string
): string {
    const current = posix.extname(path);

    if ((from === '*' && current !== next) || current === from) {
        path = path.substring(0, path.length - current.length);
        return next ? path + next : path;
    }

    return path;
}

function getOrCreatePage(
    cortex: Map<string, Page>,
    pageName: string,
    fileUri: Uri | undefined): Page {
    
    let page: Page;

    if (cortex.has(pageName)) {
        page = cortex.get(pageName)!;

        if (!page.uri) {
            page.uri = fileUri;
            page.uriAsString = fileUri?.toString();
        }
    }

    else {
        logger.appendLine(`Create page ${pageName}`);

        page = new Page(
            pageName,
            fileUri,
            fileUri?.toString(),
            [],
            []);
        
        cortex.set(pageName, page);
    }

    return page;
}

export function deactivate() {}