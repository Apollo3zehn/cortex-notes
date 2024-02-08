import path from "path";
import { TreeItemCollapsibleState, TreeItem, MarkdownString } from "vscode";
import { CollapsibleTreeItem, GitItem } from "../todoTypes";

export class GiteaItem extends CollapsibleTreeItem {

    static readonly ISSUES_PER_PAGE: number = 30;

    constructor(
        readonly config: any,
        readonly page?: number
    ) {
        super(
            page
                ? "More ..."
                : `Gitea: ${config.repository}`,
            
            config.collapsed === 'true' || page
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded
        );

        if (!page) {
            this.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'resources', 'light', 'gitea.svg'),
                dark: path.join(__filename, '..', '..', '..', '..', 'resources', 'dark', 'gitea.svg')
            };
        }
    }

    async getChildren(): Promise<TreeItem[]> {

        const page = this.page ? this.page : 1;
        const owner = encodeURIComponent(this.config.owner);
        const repository = encodeURIComponent(this.config.repository);
        const url = `${this.config.base_url}/api/v1/repos/${owner}/${repository}/issues?state=open&page=${page}&limit=${GiteaItem.ISSUES_PER_PAGE}`;

        const response = await fetch(url, {
            headers: {
                Authorization: `token ${this.config.api_key}`
            }
        });

        const issues = (await response.json()) as any[];
        
        const todoItems: TreeItem[] = issues
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
            });
        
        if (issues.length === GiteaItem.ISSUES_PER_PAGE) {
            todoItems.push(new GiteaItem(this.config, page + 1));
        }
        
        return todoItems;
    }
}