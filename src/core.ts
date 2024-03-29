import { Range, Uri, window } from "vscode";

export const logger = window.createOutputChannel('Cortex Notes');

export const documentSelector = [
    { language: 'markdown', scheme: 'file' }
];

export class Block {
    constructor(
        public readonly range: Range,
        public readonly links: PageLink[],
        public readonly unassociatedTodoItems: TodoItem[]) {
        //
    }
}

export class Page {
    constructor(
        public readonly name: string,
        public uri: Uri | undefined,
        public uriAsString: string | undefined,
        public readonly blocks: Block[],
        public readonly backlinks: PageLink[]) {
        //
    }
}

export class PageLink {
    constructor(
        public readonly source: Page,
        public readonly target: Page,
        public readonly range: Range,
        public readonly type: LinkType,
        public readonly todoItems: TodoItem[]) {
        //
    }
}

export enum LinkType {
    Wikilink,
    Hashtag
}

export enum Priority {
    Reset,
    A,
    B,
    C
}

export class TodoItem {
    constructor(
        public readonly range: Range,
        public readonly state: TodoState,
        public readonly priority: Priority | undefined,
        public readonly priorityRange: Range | undefined,
        public readonly date: Date | undefined,
        public readonly dateRange: Range | undefined) {
        //
    }
}

export enum TodoState {
    Todo,
    Done
}