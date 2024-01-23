import { posix } from "path";
import { workspace, Range, Uri } from "vscode";
import { Page, logger, PageLink, LinkType } from "./global";
import { getExcludePatterns } from "./settings";

export async function buildCortex(): Promise<Map<string, Page>> {
    
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