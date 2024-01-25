import { posix } from "path";
import { workspace, Range, Uri, TextDocument } from "vscode";
import { Page, logger, PageLink, LinkType } from "./global";
import { getExcludePatterns } from "./settings";

const _wikilinkRegex = /\[{2}([^\[]+)\]{2}/dg;
const _hashTagsRegex = /(?:^|\s)#([\p{L}\p{Emoji_Presentation}\p{N}/_-]+)/dgmu;

export async function buildCortex(): Promise<Map<string, Page>> {
    
    logger.appendLine(`Build cortex`);

    const excludePatterns = getExcludePatterns();

    const fileUris = await workspace.findFiles(
        "**/*.md",
        `{${excludePatterns.join(',')}}`
    );

    const cortex = new Map<string, Page>();
    const tasks: Promise<void>[] = [];

    for (const fileUri of fileUris) {

        logger.appendLine(`Processing ${fileUri.toString()}`);

        const task = async () => {
            const document = await workspace.openTextDocument(fileUri);
            analyzeCortexFile(cortex, document);
        };
        
        tasks.push(task());
    }

    await Promise.all(tasks);

    return cortex;
}

export function updateCortexPage(cortex: Map<string, Page>, document: TextDocument) {

    let pageName = getPageName(document.uri);
    logger.appendLine(`Update page ${pageName}`);

    let page = getOrCreatePage(cortex, pageName, document.uri);
    const clonedLinks = [...page.links];

    // clear links of source page and backlinks of target page
    const processedTargetPages = new Set<Page>();

    for (const link of page.links) {

        const targetPage = link.target;

        if (processedTargetPages.has(targetPage)) {
            continue;
        }

        const targetPageBacklinks = targetPage.backlinks;
        const linksToKeep = targetPageBacklinks.filter(current => current.source !== page);

        targetPageBacklinks.length = 0;
        targetPageBacklinks.push(...linksToKeep);

        processedTargetPages.add(targetPage);
    }

    page.links.length = 0;

    // analyze cortex file
    analyzeCortexFile(cortex, document);

    // delete orphaned pages
    for (const link of clonedLinks) {

        const targetPage = link.target;

        if (!targetPage.uri && targetPage.backlinks.length === 0) {
            deleteCortexPage(cortex, targetPage);
        }
    }
}

export function deleteCortexPage(cortex: Map<string, Page>, page: Page) {

    logger.appendLine(`Delete page ${page.name}`);

    // clear backlinks
    for (const backlink of page.backlinks) {
        const linksOfTarget = backlink.target.links;
        const linksToKeep = linksOfTarget.filter(current => current.source !== page);

        linksOfTarget.length = 0;
        linksOfTarget.push(...linksToKeep);
    }

    // delete page
    cortex.delete(page.name);
}

export function deleteCortexPageByUri(cortex: Map<string, Page>, uri: Uri) {

    let pageName = getPageName(uri);
    let page = getOrCreatePage(cortex, pageName, undefined);

    deleteCortexPage(cortex, page);
}

function analyzeCortexFile(
    cortex: Map<string, Page>,
    document: TextDocument) {

    const uri = document.uri;

    if (uri.scheme !== "file") {
        return;
    }

    const sourcePageName = getPageName(uri);
    const sourcePage = getOrCreatePage(cortex, sourcePageName, uri);
    const allMatches: RegExpMatchArray[] = [];
    
    // wikilinks
    const text = document.getText();
    const wikilinkMatches = text.matchAll(_wikilinkRegex);

    for (const match of wikilinkMatches) {

        if (!match.indices) {
            return;
        }

        match.indices[1][0] -= 2;
        match.indices[1][1] += 2;

        allMatches.push(match);
    }

    const hashTagMatches = text.matchAll(_hashTagsRegex);

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