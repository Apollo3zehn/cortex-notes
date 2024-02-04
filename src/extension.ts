import { ExtensionContext, workspace } from 'vscode';
import { activate as activateCompletions } from './features/linkCompletions';
import { activate as activateLinks } from './features/linkProvider';
import { activate as activateDecorations } from './features/decorations';
import { activate as activateBacklinks } from './features/backlinks';
import { activate as activateTodo } from './features/todos';
import { logger } from './core';
import { buildCortex, deleteCortexPageByUri } from './cortex';

export async function activate(context: ExtensionContext) {

    logger.appendLine('Extension activated');

    if (workspace.workspaceFolders === undefined) {
        logger.appendLine('No workspace open, exiting');
        return;
    }

    const cortex = await buildCortex();

    activateDecorations(context, cortex);
    activateLinks(context, cortex);
    activateCompletions(context, cortex);
    activateBacklinks(context, cortex);
    activateTodo(context);

    // update on delete
    const watcher = workspace.createFileSystemWatcher('**/*');

    watcher.onDidDelete(uri => deleteCortexPageByUri(cortex, uri),
        null,
        context.subscriptions);
}

export function deactivate() {}