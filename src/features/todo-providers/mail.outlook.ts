import { AuthenticationRecord, InteractiveBrowserCredential, useIdentityPlugin } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import { FileAttachment, Message } from "@microsoft/microsoft-graph-types";
import { exec } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { MarkdownString, ProgressLocation, ThemeIcon, TreeItem, TreeItemCollapsibleState, window } from "vscode";
import { ChildrenCachingTreeItem } from "../todoTypes";

// To solve NODE_MODULE_VERSION mismatch errors (caused by a dependency of "@azure/identity-cache-persistence"):
// 1. Get Electron version via vscode -> Help -> About -> Electron
// 2. pnpm install --save-dev electron@<version>
// 3. pnpm install --save-dev @electron/rebuild
// 4. node_modules/.bin/electron-rebuild
import { cachePersistencePlugin } from "@azure/identity-cache-persistence";
useIdentityPlugin(cachePersistencePlugin);

export class OutlookItem extends ChildrenCachingTreeItem {

    static readonly MESSAGES_PER_PAGE: number = 15;

    private graphClient: Client | undefined = undefined;

    constructor(
        readonly config: any,
        readonly nextLink?: string,
        graphClient?: Client
    ) {
        super(
            nextLink
                ? 'More ...'
                : 'Outlook',
            
            config.collapsed === 'true' || nextLink
                ? TreeItemCollapsibleState.Collapsed
                : TreeItemCollapsibleState.Expanded
        );

        if (!nextLink) {

            this.description = config.username;
            this.contextValue = "can-reload";

            this.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'resources', 'light', 'microsoftoutlook.svg'),
                dark: path.join(__filename, '..', '..', '..', '..', 'resources', 'dark', 'microsoftoutlook.svg')
            };
        }

        this.graphClient = graphClient;
    }

    async internalGetChildren(): Promise<TreeItem[]> {

        if (!this.graphClient) {
            this.graphClient = await this.getGraphClientAsync();
        }

        try {
            
            const messagesResponse: any = this.nextLink
                
                ? await this.graphClient
                    .api(this.nextLink)
                    .get()
                
                : this.config.filter
                    
                    ? await this.graphClient
                        .api('/me/mailFolders/inbox/messages')
                        .filter(this.config.filter)
                        .top(OutlookItem.MESSAGES_PER_PAGE)
                        .get()
                    
                    : await this.graphClient
                        .api('/me/mailFolders/inbox/messages')
                        .top(OutlookItem.MESSAGES_PER_PAGE)
                        .get();
            
            const messages: Message[] = messagesResponse.value;
            const messageItems: TreeItem[] = [];

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

                const label = `${from}`;
                const subject = message.subject ?? 'unknown subject';

                if (message.id && message.hasAttachments) {

                    attachments = (await this.graphClient
                        .api(`/me/messages/${message.id}/attachments?$select=id,name`)
                        .get()).value;

                    todoItem = new OutlookMailWithAttachmentItem(
                        label,
                        message.id,
                        attachments ?? [],
                        this.graphClient);
                    
                    todoItem.description = subject;

                }

                else {
                    todoItem = new TreeItem(label);

                    todoItem.description = subject;
                    todoItem.tooltip = tooltip;
                    todoItem.iconPath = new ThemeIcon('mail');
                    
                    if (message.webLink) {
                        this.command = {
                            title: "Open",
                            command: "vscode.open",
                            arguments: [message.webLink]
                        };
                    }
                }

                messageItems.push(todoItem);
            }

            const nextLink: string = messagesResponse["@odata.nextLink"];

            if (nextLink) {
                messageItems.push(new OutlookItem(this.config, nextLink));
            }
                
            return messageItems;
        }
        
        catch (error) {

            const item = new TreeItem("Unable to retrieve Outlook messages");

            item.tooltip = (<any>error).toString();
            item.iconPath = new ThemeIcon('error');

            return [
                item
            ];
        }
    }

    private async getGraphClientAsync(): Promise<Client> {

        // https://github.com/Azure/azure-sdk-for-python/issues/23721#issuecomment-1083539872
        // https://learn.microsoft.com/en-us/graph/sdks/choose-authentication-providers?tabs=typescript#device-code-provider

        /* Related issue: https://github.com/Azure/azure-sdk-for-js/issues/28896
         * 
         * The user is required to log into the Outlook account and do the confirmation twice
         * because due to the following:
         * - We want to be able to log into multiple Outlook accounts (e.g. work and private)
         * - We want Azure Identity to cache the tokens that belong to the accounts
         * - Azure Identity needs a user provided AuthenticationRecord to distinguish between
         *   multiple cached tokens
         * - To get that AuthenticationRecord once, we call credential.authenticate(...);
         * - If there are already tokens in the cache, Azure Identity will use these instead of
         *   reauthenticating.
         * - In that case we get AuthenticationRecord for the wrong (cached) user account.
         * - So we disable the token cache when there is no AuthenticationRecord available and
         *   we need one. The AuthenticationRecord is then serialized to disk.
         * - Disabling the token cache in this case lets us authenticate to multiple user accounts
         *   and we get correct AuthenticationRecord per account but the disadvantage is that
         *   the next time the user needs to authenticate again to populate the token cache.
         */

        const authenticationRecordFolderPath = path.join(os.homedir(), ".IdentityService");
        const authenticationRecordFilePath = path.join(authenticationRecordFolderPath, `cortex_notes@${this.config.login_hint}.json`);

        let authenticationRecord: AuthenticationRecord | undefined;

        try {

            const jsonString = await fs.readFile(authenticationRecordFilePath, {
                encoding: 'utf8'
            });

            authenticationRecord = JSON.parse(jsonString);
        } catch (err) {
            // ignore
        }

        const scopes = ['Mail.ReadWrite', 'Calendars.Read'];

        const credential = new InteractiveBrowserCredential({
            tenantId: 'common',
            clientId: 'f470bc86-5748-46ef-8d92-450964420fb9',
            tokenCachePersistenceOptions: {
                /* The condition is required because of the 
                 * multi-account problem described above. */
                enabled: authenticationRecord !== undefined,
            },
            loginHint: this.config.login_hint,
            authenticationRecord: authenticationRecord
        });

        if (!authenticationRecord) {
            authenticationRecord = await credential.authenticate(scopes);

            try {

                await fs.mkdir(authenticationRecordFolderPath, {
                    recursive: true
                });

                let jsonString = JSON.stringify(authenticationRecord);

                await fs.writeFile(authenticationRecordFilePath, jsonString);
            } catch (error) {
                // ignore
            }
        }

        const authProvider = new TokenCredentialAuthenticationProvider(credential, {
            scopes: scopes,
        });
            
        const graphClient = Client.initWithMiddleware({ authProvider: authProvider });

        return graphClient;
    }
}

class OutlookMailWithAttachmentItem extends ChildrenCachingTreeItem {

    constructor(
        label: string,
        readonly messageId: string,
        readonly attachments: FileAttachment[],
        readonly graphClient: Client
    ) {
        super(
            label,
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

                            const attachmentWithData: FileAttachment = await this.graphClient
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
        
            item.iconPath = {
                light: path.join(__filename, '..', '..', '..', '..', 'resources', 'light', 'attachment.svg'),
                dark: path.join(__filename, '..', '..', '..', '..', 'resources', 'dark', 'attachment.svg')
            };

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