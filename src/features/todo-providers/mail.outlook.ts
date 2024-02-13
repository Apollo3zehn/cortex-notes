import { InteractiveBrowserCredential, useIdentityPlugin } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import { FileAttachment, Message } from "@microsoft/microsoft-graph-types";
import { exec } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { MarkdownString, ProgressLocation, ThemeIcon, TreeItem, TreeItemCollapsibleState, Uri, window } from "vscode";
import { CollapsibleTreeItem, TodoTreeItem } from "../todoTypes";

// To solve NODE_MODULE_VERSION mismatch errors (caused by a dependency of "@azure/identity-cache-persistence"):
// 1. Get Electron version via vscode -> Help -> About -> Electron
// 2. pnpm install --save-dev electron@<version>
// 3. pnpm install --save-dev electron-rebuild
import { cachePersistencePlugin } from "@azure/identity-cache-persistence";
useIdentityPlugin(cachePersistencePlugin);

// https://learn.microsoft.com/en-us/graph/sdks/choose-authentication-providers?tabs=typescript#device-code-provider
const credential = new InteractiveBrowserCredential({
    tenantId: 'common',
    clientId: 'f470bc86-5748-46ef-8d92-450964420fb9',
    tokenCachePersistenceOptions: {
        enabled: true
    },
});

// const b = async () => {
//     const account = await credential.authenticate('Mail.ReadWrite');
//     const c = 2;
// };

// b();

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: [
        'Mail.ReadWrite'
    ],
});
    
const graphClient = Client.initWithMiddleware({ authProvider: authProvider });

export class OutlookItem extends CollapsibleTreeItem {

    static readonly ISSUES_PER_PAGE: number = 30;

    constructor(
        readonly config: any,
        readonly page?: number
    ) {
        super(
            page
                ? 'More ...'
                : 'Outlook',
            
            config.collapsed === 'true' || page
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded
        );

        if (!page) {

            this.description = config.username;
            this.contextValue = "can-reload";

            this.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'resources', 'light', 'microsoftoutlook.svg'),
                dark: path.join(__filename, '..', '..', '..', '..', 'resources', 'dark', 'microsoftoutlook.svg')
            };
        }
    }

    async internalGetChildren(): Promise<TreeItem[]> {

        try {

            // const page = this.page ? this.page : 1;
            // const owner = encodeURIComponent(this.config.owner);
            // const repository = encodeURIComponent(this.config.repository);
            // const url = `${this.config.base_url}/api/v1/repos/${owner}/${repository}/issues?state=open&page=${page}&limit=${OutlookItem.ISSUES_PER_PAGE}`;

            const messages: Message[] = (await graphClient.api('/me/mailFolders/inbox/messages').top(10).get()).value;

            const todoItems: TodoTreeItem[] = [];

            for (const message of messages) {
                
                const from =
                    message.from!.emailAddress!.name ??
                    message.from!.emailAddress!.address ??
                    message.sender?.emailAddress ??
                    "unknown sender";
                
                let tooltip: string | MarkdownString | undefined = undefined;
                
                if (message.body) {

                    if (message.body.contentType === "html") {

                        const pandocResponse: string = await new Promise((resolve, reject) => {

                            const child = exec('pandoc --from html --to gfm', (error, stdout, _) => {

                                if (error) {
                                    reject(error.message);
                                }
                                
                                resolve(stdout);
                            });
                            
                            child.stdin!.write(message.body!.content);
                            child.stdin!.end();
                        });

                        tooltip = new MarkdownString(pandocResponse);
                        tooltip.supportHtml = true;
                    }

                    else {
                        tooltip = message.body.content!;
                    }
                }

                let attachments: FileAttachment[] | undefined = undefined;
                let todoItem: TreeItem;

                const subject = message.subject ?? 'unknown subject';

                if (message.id && message.hasAttachments) {

                    attachments = (await graphClient
                        .api(`/me/messages/${message.id}/attachments?$select=id,name`)
                        .get()).value;

                    todoItem = new OutlookMailWithAttachmentItem(
                        subject,
                        message.id,
                        attachments ?? []);
                }

                else {
                    todoItem = new TodoTreeItem(
                        `${from}`,
                        subject,
                        message.webLink ? Uri.parse(message.webLink) : undefined,
                        undefined,
                        tooltip,
                        message.hasAttachments ? 'files' : 'mail',
                        undefined,
                        undefined);
                }

                todoItems.push(todoItem);
            }
                
            return todoItems;
        }
        
        catch (error) {
            return [
                new TodoTreeItem(
                    "Unable to retrieve Outlook messages",
                    undefined,
                    undefined,
                    undefined,
                    (<any>error).toString(),
                    'error',
                    undefined,
                    undefined
                )
            ];
        }
    }
}

export class OutlookMailWithAttachmentItem extends CollapsibleTreeItem {

    constructor(
        subject: string,
        readonly messageId: string,
        readonly attachments: FileAttachment[],
    ) {
        super(
            subject,
            TreeItemCollapsibleState.Collapsed
        );
    }

    internalGetChildren(): Promise<TreeItem[]> {

        const attachmentItems = this.attachments.map(attachment => {

            const downloadAttachment = async () => {

                try {

                    await window.withProgress(
                        {
                            location: ProgressLocation.Notification
                        },
                        async progress => {

                            progress.report({
                                message: `Downloading ${attachment.name} ...`
                            });

                            const attachmentWithData: FileAttachment = await graphClient
                                .api(`/me/messages/${this.messageId}/attachments/${attachment.id}`)
                                .get();
                            
                            if (attachment.name && attachmentWithData.contentBytes) {

                                const binaryData = Buffer
                                    .from(attachmentWithData.contentBytes!, 'base64');
                                
                                const downloadDir = path.join(os.tmpdir(), 'cortex-notes');

                                await fs.mkdir(downloadDir, {
                                    recursive: true
                                });

                                const downloadFilePath = path.join(downloadDir, attachment.name);

                                // check if file exists here!
                                // find better "attachment icon"
                                // offer button to open file oder to open folder
                                // maybe download to "Downloads folder"

                                try {
                                    await fs.writeFile(downloadFilePath, binaryData);
                                } catch (error) {
                                    window.showErrorMessage(`Unable to save attachment: ${error}`);
                                }
                            }
                        }
                    );
                }
                
                catch (error) {
                    window.showErrorMessage(`Unable to download attachment: ${error}`);
                }
            };

            const item = new TreeItem(
                attachment.name ?? `unknown attachment name`
            );
        
            item.iconPath = new ThemeIcon('files');

            item.command = {
                title: 'Run the tree item custom action',
                command: 'cortex-notes.tree-item-custom-action',
                arguments: [downloadAttachment]
            };
        
            return item;
        });

        return Promise.resolve(attachmentItems);
    } 
}