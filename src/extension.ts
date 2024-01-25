import { ExtensionContext, ViewColumn, commands, window, workspace } from 'vscode';
import { activate as activateCompletions } from './features/linkCompletions';
import { activate as activateDecorations } from './features/decorations';
import { activate as activatePeekBacklinks } from './features/peekBacklinks';
import { logger } from './global';
import { buildCortex, deleteCortexPageByUri } from './cortex';

export async function activate(context: ExtensionContext) {

    logger.appendLine('Extension activated');

    if (workspace.workspaceFolders === undefined) {
        logger.appendLine('No workspace open, exiting');
        return;
    }

    const cortex = await buildCortex();

    activateDecorations(context, cortex);
    activateCompletions(context, cortex);
    activatePeekBacklinks(context, cortex);

    // update on delete
    const watcher = workspace.createFileSystemWatcher('**/*');

    watcher.onDidDelete(uri => deleteCortexPageByUri(cortex, uri),
        null,
        context.subscriptions);
}

export function deactivate() {}