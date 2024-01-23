import { ExtensionContext, commands, window, workspace } from 'vscode';
import { activate as activateCompletions } from './features/completions';
import { activate as activateDecorations } from './features/decorations';
import { logger } from './global';
import { buildCortex } from './cortex';

export async function activate(context: ExtensionContext) {

    logger.appendLine('Extension activated');

    if (workspace.workspaceFolders === undefined) {
        logger.appendLine('No workspace open, exiting');
        return;
    }

    let disposable = commands.registerCommand('cortex-notes.helloWorld', () => {
        window.showInformationMessage('Hello World from cortex-notes!');
    });

    context.subscriptions.push(disposable);

    const cortex = await buildCortex();

    activateDecorations(context, cortex);
    activateCompletions(context, cortex);
}

export function deactivate() {}