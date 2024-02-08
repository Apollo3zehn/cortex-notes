import { components } from "@octokit/openapi-types";
import { OctokitResponse } from "@octokit/types";
import { Octokit } from "octokit";
import path from "path";
import { MarkdownString, TreeItem, TreeItemCollapsibleState, Uri } from "vscode";
import { CollapsibleTreeItem, GitItem } from "../todoTypes";

type IssueItem = components["schemas"]["issue"];

export class GitHubItem extends CollapsibleTreeItem {

    static readonly ISSUES_PER_PAGE: number = 30;

    constructor(
        config: any
    );

    constructor(
        config: any,
        issuesIterator?: AsyncIterator<OctokitResponse<IssueItem[]>, void, unknown>
    );

    constructor(
        readonly config: any,
        private issuesIterator?: AsyncIterator<OctokitResponse<IssueItem[]>, void, unknown>
    ) {
        super(
            issuesIterator
                ? "More ..."
                : `GitHub: ${config.repository}`,
            
            config.collapsed === 'true' || issuesIterator
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded
        );

        if (!issuesIterator) {

            const octokit = new Octokit({
                auth: this.config.api_key
            });

            const issuesIterator = octokit.paginate.iterator(
                octokit.rest.issues.listForRepo,
                {
                    owner: this.config.owner,
                    repo: this.config.repository,
                    per_page: GitHubItem.ISSUES_PER_PAGE
                }
            );

            this.issuesIterator = GitHubItem.Iterate(issuesIterator);

            this.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'resources', 'light', 'github.svg'),
                dark: path.join(__filename, '..', '..', '..', '..', 'resources', 'dark', 'github.svg')
            };
        }
    }

    static async * Iterate(iterator: any) {
        for await (const item of iterator) {
            yield item;
        }
    }

    async internalGetChildren(): Promise<TreeItem[]> {
        
        const iteratorResult = await this.issuesIterator!.next();

        if (iteratorResult.done) {
            return [];
        }

        const issues = iteratorResult.value.data;

        const todoItems: TreeItem[] = issues
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
        
        if (issues.length === GitHubItem.ISSUES_PER_PAGE) {
            todoItems.push(new GitHubItem(this.config, this.issuesIterator));
        }

        return todoItems;
    }
}