import { TreeItem, TreeItemCollapsibleState, ThemeIcon, MarkdownString, Uri, workspace } from "vscode";
import { Page, TodoItem, TodoState, Block } from "../../core";
import { CollapsibleTreeItem, GitItem } from "../todoTypes";

class TodoItemsContainer extends CollapsibleTreeItem {

    constructor(
        title: string,
        readonly todoItems: TreeItem[],
        collapsibleState: TreeItemCollapsibleState) {
        
        super(
            title,
            collapsibleState
        );
    }

    async internalGetChildren(): Promise<TreeItem[]> {
        return Promise.resolve(this.todoItems);
    }
}

export class TodoItems extends CollapsibleTreeItem {

    constructor(
        config: any,
        readonly page: Page
    ) {
        super(
            'TODO',
            config.collapsed === 'true'
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded
        );

        this.iconPath = new ThemeIcon("issue-closed");
    }

    async internalGetChildren(): Promise<TreeItem[]> {

        const consumedRawTodoItems = new Set<TodoItem>();
        const openTodoItems: TreeItem[] = [];
        const doneTodoItems: TreeItem[] = [];

        /* TODO items in page */
        for (const block of this.page.blocks) {

            for (const link of block.links) {

                for (const rawTodoItem of link.todoItems) {

                    if (consumedRawTodoItems.has(rawTodoItem)) {
                        continue;
                    }

                    const todoItem = await this.createTodoItem(this.page.uri!, rawTodoItem, block, "arrow-right");

                    rawTodoItem.state === TodoState.Todo
                        ? openTodoItems.push(todoItem)
                        : doneTodoItems.push(todoItem);

                    consumedRawTodoItems.add(rawTodoItem);
                }
            }

            for (const rawTodoItem of block.unassociatedTodoItems) {

                const todoItem = await this.createTodoItem(this.page.uri!, rawTodoItem, block, "dash");
                
                rawTodoItem.state === TodoState.Todo
                    ? openTodoItems.push(todoItem)
                    : doneTodoItems.push(todoItem);
            }
        }

        /* TODO items in backlinks */
        for (const backlink of this.page.backlinks) {
           
            for (const rawTodoItem of backlink.todoItems) {

                if (consumedRawTodoItems.has(rawTodoItem)) {
                    continue;
                }

                const sourcePage = backlink.source;
                const block = sourcePage.blocks.find(block => block.links.some(link => link === backlink));

                if (!(sourcePage.uri && block)) {
                    continue;
                }

                const todoItem = await this.createTodoItem(sourcePage.uri, rawTodoItem, block, "arrow-left");
                
                rawTodoItem.state === TodoState.Todo
                    ? openTodoItems.push(todoItem)
                    : doneTodoItems.push(todoItem);
                
                consumedRawTodoItems.add(rawTodoItem);
            }
        }

        if (openTodoItems.length === 0 && doneTodoItems.length === 0) {
            return [
                new GitItem(
                    '',
                    'There are no TODO items for this page',
                    undefined,
                    new MarkdownString(''),
                    undefined,
                    TreeItemCollapsibleState.None)
            ];
        }

        if (openTodoItems.length === 0) {
            openTodoItems.push(new GitItem(
                '',
                'There are no TODO items for this page',
                undefined,
                new MarkdownString(''),
                undefined,
                TreeItemCollapsibleState.None));
        }

        if (doneTodoItems.length === 0) {
            doneTodoItems.push(new GitItem(
                '',
                'There are no DONE items for this page',
                undefined,
                new MarkdownString(''),
                undefined,
                TreeItemCollapsibleState.None));
        }

        return [
            new TodoItemsContainer(
                "Open",
                openTodoItems,
                TreeItemCollapsibleState.Expanded
            ),
            new TodoItemsContainer(
                'DONE',
                doneTodoItems,
                TreeItemCollapsibleState.Collapsed
            )
        ];
    }

    private async createTodoItem(
        pageUri: Uri,
        rawTodoItem: TodoItem,
        sourceBlock: Block,
        iconId: string) {
        
        const document = await workspace.openTextDocument(pageUri);
        const line = rawTodoItem.range.start.line;

        const label = document
            .lineAt(line).text
            .replace("- TODO ", '')
            .replace("- DONE ", '')
            .trim();

        const tooltip = document.getText(sourceBlock.range);

        const todoItem = new GitItem(
            label,
            '',
            pageUri,
            new MarkdownString(tooltip),
            undefined,
            TreeItemCollapsibleState.None);
        
        todoItem.iconPath = new ThemeIcon(iconId);
        
        return todoItem;
    }
}