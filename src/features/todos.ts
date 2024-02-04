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

class GitHubIssueItem extends TreeItem {
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

                const labels = issue.labels.length === 0
                    ? ''
                    : ` [${issue.labels.map(label => {

                        if (typeof label === "string") {
                            return label;
                        }

                        else {
                            return label.name;
                        }
                        
                    }).join(' | ')}]`;

                return new GitHubIssueItem(
                    `#${issue.number} - ${issue.title}${labels}`,
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

                    resolve(treeItems);
                }

                resolve([]);
            });
        }
    }
}