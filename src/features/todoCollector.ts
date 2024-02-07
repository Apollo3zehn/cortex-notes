import { Octokit } from "octokit";
import path from "path";
import toml from "toml";
import { Event, EventEmitter, ExtensionContext, MarkdownString, ProviderResult, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState, Uri, window, workspace } from "vscode";
import { Block, Page, TodoItem, TodoState } from "../core";
import { getPageByUri } from "../cortex";
import { changeExtension, fileExists, isSupportedFile } from "../utils";

export async function activate(
    context: ExtensionContext,
    cortex: Map<string, Page>) {
    
    const provider = new TodoTreeDataProvider(context, cortex);

    context.subscriptions.push(
        window.registerTreeDataProvider(
            'cortex-notes.todos',
            provider));
}

abstract class CollapsibleTreeItem extends TreeItem {
    abstract getChildren(): Promise<TreeItem[]>;
}

class GitItem extends TreeItem {
    constructor(
        readonly label: string,
        readonly description: string,
        readonly uri: Uri | undefined,
        readonly tooltip: MarkdownString,
        readonly iconId: string | undefined,
        readonly collapsibleState: TreeItemCollapsibleState) {
        
        super(label, collapsibleState);

        this.description = description;
        this.tooltip = tooltip;

        if (iconId) {
            this.iconPath = new ThemeIcon(iconId);
        }

        this.command = {
            title: "Open",
            command: "vscode.open",
            arguments: uri === undefined ? undefined : [uri]
        };
    }
}

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

    async getChildren(): Promise<TreeItem[]> {
        return Promise.resolve(this.todoItems);
    }
}

class TodoItems extends CollapsibleTreeItem {

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

    async getChildren(): Promise<TreeItem[]> {

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
                "Done",
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

class GiteaIssuesItem extends CollapsibleTreeItem {

    constructor(
        public readonly config: any,
    ) {
        super(
            `Gitea Issues: ${config.repository}`,
            config.collapsed === 'true'
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded
        );

        this.iconPath = {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'gitea.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'gitea.svg')
        };
    }

    async getChildren(): Promise<TreeItem[]> {

        const owner = encodeURIComponent(this.config.owner);
        const repository = encodeURIComponent(this.config.repository);
        const url = `${this.config.base_url}/api/v1/repos/${owner}/${repository}/issues?state=open`;

        const response = await fetch(url, {
            headers: {
                Authorization: `token ${this.config.api_key}`
            }
        });

        const issues = (await response.json()) as any[];
        
        const todoItems = issues
            .map(issue => {

                const labels = (<string[]>issue.labels);

                const description = labels.length === 0
                    ? ''
                    : labels.join(' | ');
              
                return new GitItem(
                    issue.title,
                    `#${issue.number} ${description === '' ? '' : "| " + description}`,
                    issue.html_url,
                    new MarkdownString(issue.body),
                    issue.pull_request ? 'git-pull-request' : 'circle-outline',
                    TreeItemCollapsibleState.None);
                
                return new GitItem(
                    issue.title,
                    `#${issue.number} ${description === '' ? '' : "| " + description}`,
                    Uri.parse(issue.html_url),
                    new MarkdownString(issue.body ?? undefined),
                    issue.pull_request ? 'git-pull-request' : 'circle-outline',
                    TreeItemCollapsibleState.None);
            });
        
        return todoItems;
    }
}

class GitLabIssuesItem extends CollapsibleTreeItem {

    constructor(
        public readonly config: any,
    ) {
        super(
            `GitLab Issues: ${config.repository}`,
            config.collapsed === 'true'
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded
        );

        this.iconPath = {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'gitlab.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'gitlab.svg')
        };
    }

    async getChildren(): Promise<TreeItem[]> {

        const repository = encodeURIComponent(this.config.repository);
        const url = `${this.config.base_url}/api/v4/projects/${repository}/issues?assignee_username=${this.config.assignee_username}&state=opened`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.config.api_key}`
            }
        });

        const issues = (await response.json()) as any[];
        
        const todoItems = issues
            .map(issue => {

                const labels = (<string[]>issue.labels);

                const description = labels.length === 0
                    ? ''
                    : labels.map(label => label).join(' | ');
              
                return new GitItem(
                    issue.title,
                    `#${issue.iid} ${description === '' ? '' : "| " + description}`,
                    issue.web_url,
                    new MarkdownString(issue.description),
                    'circle-outline',
                    TreeItemCollapsibleState.None);
            });
        
        return todoItems;
    }
}

class GitLabMergeRequestsItem extends CollapsibleTreeItem {

    constructor(
        public readonly config: any,
    ) {
        super(
            `GitLab MRs: ${config.repository}`,
            config.collapsed === 'true'
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded
        );

        this.iconPath = {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'gitlab.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'gitlab.svg')
        };
    }

    async getChildren(): Promise<TreeItem[]> {

        const repository = encodeURIComponent(this.config.repository);
        const url = `${this.config.base_url}/api/v4/projects/${repository}/merge_requests?author_username=${this.config.author_username}&state=opened`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.config.api_key}`
            }
        });

        const mergeRequests = (await response.json()) as any[];
        
        const todoItems = mergeRequests
            .map(issue => {

                const labels = (<string[]>issue.labels);

                const description = labels.length === 0
                    ? ''
                    : labels.map(label => label).join(' | ');
              
                return new GitItem(
                    issue.title,
                    `!${issue.iid} ${description === '' ? '' : "| " + description}`,
                    issue.web_url,
                    new MarkdownString(issue.description),
                    'git-pull-request',
                    TreeItemCollapsibleState.None);
            });
        
        return todoItems;
    }
}

class GitHubItem extends CollapsibleTreeItem {

    constructor(
        public readonly config: any,
    ) {
        super(
            `GitHub: ${config.repository}`,
            config.collapsed === 'true'
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded
        );

        this.iconPath = {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'github.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'github.svg')
        };
    }

    async getChildren(): Promise<TreeItem[]> {

        const octokit = new Octokit({
            auth: this.config.api_key
        });

        const issues = await octokit.rest.issues.listForRepo({
            owner: this.config.owner,
            repo: this.config.repository
        });
    
        const todoItems = issues.data
            .map(issue => {

                const description = issue.labels.length === 0
                    ? ''
                    : issue.labels.map(label => {

                        if (typeof label === "string") {
                            return label;
                        }

                        else {
                            return label.name;
                        }
                        
                    }).join(' | ');

                return new GitItem(
                    issue.title,
                    `#${issue.number} ${description === '' ? '' : "| " + description}`,
                    Uri.parse(issue.html_url),
                    new MarkdownString(issue.body ?? undefined),
                    issue.pull_request ? 'git-pull-request' : 'circle-outline',
                    TreeItemCollapsibleState.None);
            });
        
        return todoItems;
    }
}

class TodoTreeDataProvider implements TreeDataProvider<TreeItem> {
    
    onDidChangeTreeData?: Event<void | TreeItem | TreeItem[] | null | undefined> | undefined;

    private _onDidChangeEmitter = new EventEmitter<void | TreeItem | TreeItem[] | null | undefined>();

    constructor(
        context: ExtensionContext,
        readonly cortex: Map<string, Page>
    ) {
        this.onDidChangeTreeData = this._onDidChangeEmitter.event;

        // update view when document is opened
        window.onDidChangeActiveTextEditor(editor => {
  
            if (!editor) {
                return;
            }
    
            this._onDidChangeEmitter.fire();
          },
          null,
          context.subscriptions
        );

        // update view when document has changed
        workspace.onDidChangeTextDocument(e => {
            this._onDidChangeEmitter.fire();
          },
          null,
          context.subscriptions
        );
    }

    getTreeItem(element: TreeItem): TreeItem | Thenable<TreeItem> {
        return element;
    }

    getChildren(element?: TreeItem | undefined): ProviderResult<TreeItem[]> {

        if (element) {

            if (element instanceof CollapsibleTreeItem) {
                return element.getChildren();
            }

            else {
                throw new Error("Unsupported tree item.");
            }
        }

        else {

            const document = window.activeTextEditor?.document;

            if (!document || !isSupportedFile(document)) {
                return [];
            }

            const tomlFileUri = Uri.file(changeExtension(document.uri.fsPath, ".md", ".config.toml"));

            return new Promise(async resolve => {

                try {

                    let config: any;

                    if (await fileExists(tomlFileUri)) {
                        const tomlDocument = await workspace.openTextDocument(tomlFileUri);
                        config = toml.parse(tomlDocument.getText()) as any;
                    }

                    else {
                        config = {
                            todo: [
                                {
                                    type: "todo-items"
                                }
                            ]
                        };
                    }

                    const treeItems: TreeItem[] = [];
        
                    if (config.todo) {

                        for (const todoConfig of config.todo) {

                            switch ((<any>todoConfig).type) {

                                case "github":
                                    treeItems.push(new GitHubItem(todoConfig));
                                    break;
                            
                                case "gitlab-issues":
                                    treeItems.push(new GitLabIssuesItem(todoConfig));
                                    break;
                                
                                case "gitlab-merge-requests":
                                    treeItems.push(new GitLabMergeRequestsItem(todoConfig));
                                    break;
                                
                                case "gitea-issues":
                                    treeItems.push(new GiteaIssuesItem(todoConfig));
                                    break;
    
                                case "todo-items":
                                    const page = getPageByUri(this.cortex, document.uri);

                                    if (page) {
                                        treeItems.push(new TodoItems(todoConfig, page));
                                    }

                                    break;
                                
                                default:
                                    break;
                            }
                        }
                    }

                    resolve(treeItems);
                }
                
                catch (error) {

                    let errorItem = new TreeItem(
                        `Could not read .config.toml file: ${error}`
                    );

                    errorItem.iconPath = new ThemeIcon("error");

                    resolve([
                        errorItem
                    ]);
                }
            });
        }
    }
}