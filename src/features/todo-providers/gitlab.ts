import path from "path";
import { TreeItemCollapsibleState, TreeItem, MarkdownString } from "vscode";
import { CollapsibleTreeItem, GitItem } from "../todoTypes";

export class GitLabIssuesItem extends CollapsibleTreeItem {

    static readonly ISSUES_PER_PAGE: number = 30;

    constructor(
        readonly config: any,
        readonly page?: number
    ) {
        super(
            page
                ? "More ..."
                : `GitLab Issues: ${config.repository}`,
            
            config.collapsed === 'true' || page
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded
        );

        if (!page) {
            this.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'resources', 'light', 'gitlab.svg'),
                dark: path.join(__filename, '..', '..', '..', '..', 'resources', 'dark', 'gitlab.svg')
            };
        }
    }

    async getChildren(): Promise<TreeItem[]> {

        const page = this.page ? this.page : 1;
        const repository = encodeURIComponent(this.config.repository);
        const url = `${this.config.base_url}/api/v4/projects/${repository}/issues?assignee_username=${this.config.assignee_username}&state=opened&page=${page}&per_page=${GitLabIssuesItem.ISSUES_PER_PAGE}`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.config.api_key}`
            }
        });

        const issues = (await response.json()) as any[];
        
        const todoItems: TreeItem[] = issues
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
        
        if (issues.length === GitLabIssuesItem.ISSUES_PER_PAGE) {
            todoItems.push(new GitLabIssuesItem(this.config, page + 1));
        }
        
        return todoItems;
    }
}

export class GitLabMergeRequestsItem extends CollapsibleTreeItem {

    static readonly MERGE_REQUESTS_PER_PAGE: number = 30;

    constructor(
        readonly config: any,
        readonly page?: number
    ) {
        super(
            page
                ? "More ..."
                : `GitLab MRs: ${config.repository}`,
            
            config.collapsed === 'true' || page
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded
        );

        if (!page) {
            this.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'resources', 'light', 'gitlab.svg'),
                dark: path.join(__filename, '..', '..', '..', '..', 'resources', 'dark', 'gitlab.svg')
            };
        }
    }

    async getChildren(): Promise<TreeItem[]> {

        const page = this.page ? this.page : 1;
        const repository = encodeURIComponent(this.config.repository);
        const url = `${this.config.base_url}/api/v4/projects/${repository}/merge_requests?author_username=${this.config.author_username}&state=opened&page=${page}&per_page=${GitLabMergeRequestsItem.MERGE_REQUESTS_PER_PAGE}`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.config.api_key}`
            }
        });

        const mergeRequests = (await response.json()) as any[];
        
        const todoItems: TreeItem[] = mergeRequests
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
        
        if (mergeRequests.length === GitLabMergeRequestsItem.MERGE_REQUESTS_PER_PAGE) {
            todoItems.push(new GitLabMergeRequestsItem(this.config, page + 1));
        }
        
        return todoItems;
    }
}