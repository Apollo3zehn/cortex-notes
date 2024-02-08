import toml from "toml";
import { Event, EventEmitter, ExtensionContext, ProviderResult, ThemeIcon, TreeDataProvider, TreeItem, Uri, window, workspace } from "vscode";
import { Page } from "../core";
import { getPageByUri } from "../cortex";
import { changeExtension, fileExists, isSupportedFile } from "../utils";
import { GiteaItem } from "./todo-providers/gitea";
import { GitHubItem } from "./todo-providers/github";
import { GitLabIssuesItem, GitLabMergeRequestsItem } from "./todo-providers/gitlab";
import { TodoItems } from "./todo-providers/todo";
import { CollapsibleTreeItem } from "./todoTypes";

export async function activate(
    context: ExtensionContext,
    cortex: Map<string, Page>) {
    
    const provider = new TodoTreeDataProvider(context, cortex);

    context.subscriptions.push(
        window.registerTreeDataProvider(
            'cortex-notes.todos',
            provider));
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
                                    treeItems.push(new GiteaItem(todoConfig));
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