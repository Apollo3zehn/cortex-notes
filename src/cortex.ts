import { workspace, Range, Uri, TextDocument, TextLine, Position } from "vscode";
import { Page, logger, PageLink, LinkType, Block, TodoItem, TodoState } from "./core";
import { getExcludePatterns } from "./settings";
import { getPageName } from "./utils";

const _wikilinkRegex = /\[{2}([^\[]+)\]{2}/dg;
const _hashTagRegex = /(?:^| )#([\p{L}\p{Emoji_Presentation}\p{N}/_-]+)/dgmu;
const _todoRegex = /^ *- (TODO|DONE)[ |$]/dg;

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

    const pageName = getPageName(document.uri);
    logger.appendLine(`Update page ${pageName}`);

    const page = getOrCreatePage(cortex, pageName, document.uri);
    const clonedLinksMap = new Map<Block, PageLink[]>();

    // clear links in all blocks of source page and backlinks of target page
    const processedTargetPages = new Set<Page>();

    for (const block of page.blocks) {
        
        clonedLinksMap.set(block, [...block.links]);

        for (const link of block.links) {

            const targetPage = link.target;

            if (processedTargetPages.has(targetPage)) {
                continue;
            }

            const backLinksOfTarget = targetPage.backlinks;
            const backLinksToKeep = backLinksOfTarget.filter(current => current.source !== page);

            // something has changed
            if (backLinksToKeep.length < backLinksOfTarget.length) {
                backLinksOfTarget.length = 0;
                backLinksOfTarget.push(...backLinksToKeep);
            }

            processedTargetPages.add(targetPage);
        }

        page.blocks.length = 0;
    }

    // analyze cortex file
    analyzeCortexFile(cortex, document);

    // delete orphaned pages
    for (const links of clonedLinksMap.values()) {

        for (const link of links) {

            const targetPage = link.target;

            if (!targetPage.uri && targetPage.backlinks.length === 0) {
                deleteCortexPage(cortex, targetPage);
            }
        }
    }
}

export function deleteCortexPage(cortex: Map<string, Page>, page: Page) {

    logger.appendLine(`Delete page ${page.name}`);

    // clear backlinks
    for (const backlink of page.backlinks) {
        
        for (const block of backlink.target.blocks) {
        
            const linksOfTarget = block.links;
            const linksToKeep = linksOfTarget.filter(current => current.source !== page);

            // something has changed
            if (linksToKeep.length < linksOfTarget.length) {
                linksOfTarget.length = 0;
                linksOfTarget.push(...linksToKeep);
            }
        }
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

    if (document.lineCount === 0) {
        return;
    }

    // blocks
    let blockStartLine: number = 0;
    let line: TextLine;

    for (let i = 0; i < document.lineCount; i++) {

        // store current block if 
        // - all lines have been processed, or
        // - a new block is about to start
        const isLastLine = i === document.lineCount - 1;

        if (isLastLine || (line = document.lineAt(i + 1)).text.startsWith("-")) {

            const blockEndLine = i;
            const blockCharacterEnd = document.lineAt(blockEndLine).range.end.character;

            const blockRange = new Range(
                new Position(blockStartLine, 0),
                new Position(blockEndLine, blockCharacterEnd)
            );

            const blockMatchesAndLinkType: [RegExpMatchArray, LinkType][] = [];
            const blockText = document.getText(blockRange);

            // find wikilinks
            const wikilinkMatches = blockText.matchAll(_wikilinkRegex);

            for (const match of wikilinkMatches) {

                if (!match.indices) {
                    continue;
                }

                match.indices[1][0] -= 2;
                match.indices[1][1] += 2;

                blockMatchesAndLinkType.push([match, LinkType.Wikilink]);
            }

            // find hashtags
            const hashTagMatches = blockText.matchAll(_hashTagRegex);

            for (const match of hashTagMatches) {
                
                if (!match.indices) {
                    continue;
                }

                match.indices[1][0] -= 1;

                blockMatchesAndLinkType.push([match, LinkType.Hashtag]);
            }

            // process & store collected page links
            const blockOffset = document.offsetAt(blockRange.start);
            const blockLinks: PageLink[] = [];

            for (const [match, linkType] of blockMatchesAndLinkType) {

                const targetPageName = match[1];
                logger.appendLine(`Found link ${sourcePageName} --> ${targetPageName}`);

                const targetPage = getOrCreatePage(cortex, targetPageName, undefined);
                const indices = match.indices![1];
                const startPos = document.positionAt(blockOffset + indices[0]);
                const endPos = document.positionAt(blockOffset + indices[1]);
                const range = new Range(startPos, endPos);
                const pageLink = new PageLink(sourcePage, targetPage, range, linkType);

                blockLinks.push(pageLink);
                targetPage.backlinks.push(pageLink);
            }
            
            // find TODOs
            const blockTodoItems: TodoItem[] = [];
            const todoMatches = blockText.matchAll(_todoRegex);

            for (const match of todoMatches) {
                
                if (!match.indices) {
                    continue;
                }

                logger.appendLine(`Found TODO item on page ${sourcePageName}`);

                const indices = match.indices![1];
                const startPos = document.positionAt(blockOffset + indices[0]);
                const endPos = document.positionAt(blockOffset + indices[1]);
                const range = new Range(startPos, endPos);
                
                const todoState = document.getText(range) === "TODO"
                    ? TodoState.Todo
                    : TodoState.Done;

                const todoItem = new TodoItem(range, todoState);
                
                blockTodoItems.push(todoItem);
            }

            const block = new Block(blockRange, blockLinks, blockTodoItems);

            sourcePage.blocks.push(block);

            // update state
            blockStartLine = i + 1;
            blockMatchesAndLinkType.length = 0;
        }
    }
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

export function getPageByUri(
    cortex: Map<string, Page>,
    uri: Uri): Page | undefined {

    const documentUriAsString = uri.toString();
    let page: Page | undefined;

    // TODO maybe create a Map<Uri, Page> for simpler lookup (but Uri is not working as key, is it?)?
    for (const current of cortex.values()) {
        if (current.uriAsString === documentUriAsString) {
            page = current;
            break;
        }
    }

    return page;
}