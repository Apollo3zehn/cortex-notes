import { TreeItem, TreeItemCollapsibleState, ThemeIcon, MarkdownString, Uri, workspace } from "vscode";
import { Page, TodoItem, TodoState, Block, Priority } from "../../core";
import { CollapsibleTreeItem, GitItem as TodoTreeItem } from "../todoTypes";

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
                new TodoTreeItem(
                    '',
                    'There are no TODO items for this page',
                    undefined,
                    undefined,
                    new MarkdownString(''),
                    undefined,
                    TreeItemCollapsibleState.None)
            ];
        }

        if (openTodoItems.length === 0) {
            openTodoItems.push(new TodoTreeItem(
                '',
                'There are no TODO items for this page',
                undefined,
                undefined,
                new MarkdownString(''),
                undefined,
                TreeItemCollapsibleState.None));
        }

        if (doneTodoItems.length === 0) {
            doneTodoItems.push(new TodoTreeItem(
                '',
                'There are no DONE items for this page',
                undefined,
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
                'Done',
                doneTodoItems,
                TreeItemCollapsibleState.Collapsed
            )
        ];
    }

    async createTodoItem(
        pageUri: Uri,
        rawTodoItem: TodoItem,
        sourceBlock: Block,
        iconId: string) {
        
        const document = await workspace.openTextDocument(pageUri);
        const line = rawTodoItem.range.start.line;

        const label = document
            .lineAt(line).text
            .replace("- TODO", '')
            .replace("- DONE", '')
            .replace("[#A]", '')
            .replace("[#B]", '')
            .replace("[#C]", '')
            .trim();

        const tooltip = document.getText(sourceBlock.range);

        const decorationUri = rawTodoItem.state === TodoState.Todo && rawTodoItem.priority
            ? this.getDecorationUri(rawTodoItem.priority)
            : undefined;

        const todoItem = new TodoTreeItem(
            label,
            '',
            pageUri,
            decorationUri,
            new MarkdownString(tooltip),
            undefined,
            TreeItemCollapsibleState.None);
        
        todoItem.iconPath = new ThemeIcon(iconId);
        
        return todoItem;
    }

    // https://code.visualstudio.com/api/references/theme-color#lists-and-trees
    static readonly _error = Uri.parse("cortex-notes://list.errorForeground");
    static readonly _warning = Uri.parse("cortex-notes://list.warningForeground");
    static readonly _info = Uri.parse("cortex-notes://editorOverviewRuler.infoForeground");

    getDecorationUri(priority: Priority): Uri | undefined {

        switch (priority) {

            case Priority.A:
                return TodoItems._error;
            
            case Priority.B:
                return TodoItems._warning;
            
            case Priority.C:
                return TodoItems._info;
            
            default:
                return undefined;
        }
    }
}