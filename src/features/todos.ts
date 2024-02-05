import { Event, EventEmitter, ExtensionContext, MarkdownString, ProviderResult, TreeDataProvider, TreeItem, TreeItemCollapsibleState, Uri, env, window, workspace } from "vscode";
import toml from "toml";
import { changeExtension, fileExists, isSupportedFile } from "../utils";
import { Octokit } from "octokit";

export async function activate(
    context: ExtensionContext) {
    
    const provider = new TodoTreeDataProvider(context);

    context.subscriptions.push(
        window.registerTreeDataProvider(
            'cortex-notes.todos',
            provider));
}

abstract class CollapsibleTreeItem extends TreeItem {
    abstract getChildren(): Promise<TreeItem[]>;
}

class IssueItem extends TreeItem {
    constructor(
        public readonly label: string,
        public readonly url: string,
        public readonly tooltip: MarkdownString,
        public readonly collapsibleState: TreeItemCollapsibleState) {
        
        super(label, collapsibleState);

        this.tooltip = tooltip;

        this.command = {
            title: "Open in browser",
            command: "vscode.open",
            arguments: [Uri.parse(url)]
        };
    }
}

class GitLabIssuesItem extends CollapsibleTreeItem {

    constructor(
        public readonly config: any,
    ) {
        super(
            `GitLab Issues: ${config.repository}`,
            TreeItemCollapsibleState.Collapsed
        );
    }

    async getChildren(): Promise<TreeItem[]> {

        const projectId = encodeURIComponent(this.config.repository);
        const url = `${this.config.base_url}/api/v4/projects/${projectId}/issues?assignee_username=${this.config.assignee_username}`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.config.api_key}`
            }
        });

        const issues = (await response.json()) as any[];
        
        const todoItems = issues
            .map(issue => {

                const labels = (<string[]>issue.labels);

                const labelString = labels.length === 0
                    ? ''
                    : ` [${labels.join(' | ')}]`;

                return new IssueItem(
                    `#${issue.iid} - ${issue.title}${labelString}`,
                    issue.web_url,
                    new MarkdownString(issue.description),
                    TreeItemCollapsibleState.None);
            });
        
        return todoItems;
    }
}

class GitHubIssuesItem extends CollapsibleTreeItem {

    constructor(
        public readonly config: any,
    ) {
        super(
            `GitHub Issues: ${config.repository}`,
            TreeItemCollapsibleState.Collapsed
        );
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
            .filter(issue => !issue.pull_request)
            .map(issue => {

                const labelString = issue.labels.length === 0
                    ? ''
                    : ` [${issue.labels.map(label => {

                        if (typeof label === "string") {
                            return label;
                        }

                        else {
                            return label.name;
                        }
                        
                    }).join(' | ')}]`;

                return new IssueItem(
                    `#${issue.number} - ${issue.title}${labelString}`,
                    issue.html_url,
                    new MarkdownString(issue.body ?? undefined),
                    TreeItemCollapsibleState.None);
            });
        
        return todoItems;
    }
}

class TodoTreeDataProvider implements TreeDataProvider<TreeItem> {
    
    onDidChangeTreeData?: Event<void | TreeItem | TreeItem[] | null | undefined> | undefined;

    private _onDidChangeEmitter = new EventEmitter<void | TreeItem | TreeItem[] | null | undefined>();

    constructor(
        context: ExtensionContext
    ) {
        this.onDidChangeTreeData = this._onDidChangeEmitter.event;

        window.onDidChangeActiveTextEditor(editor => {
  
            if (!editor) {
                return;
            }
    
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

            const todoFileUri = Uri.file(changeExtension(document.uri.fsPath, ".md", ".toml"));

            return new Promise(async resolve => {

                if (await fileExists(todoFileUri)) {

                    const document = await workspace.openTextDocument(todoFileUri);
                    const config = toml.parse(document.getText()) as any;
                    const treeItems: TreeItem[] = [];

                    if (config.todo.github) {

                        for (const projectConfig of Object.values(config.todo.github)) {
                            treeItems.push(new GitHubIssuesItem(projectConfig));
                        }
                    }

                    if (config.todo.gitlab) {

                        for (const projectConfig of Object.values(config.todo.gitlab)) {
                            treeItems.push(new GitLabIssuesItem(projectConfig));
                        }
                    }

                    resolve(treeItems);
                }

                resolve([]);
            });
        }
    }
}