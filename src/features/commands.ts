import { ExtensionContext, Position, Range, commands, window } from "vscode";
import { Page, TodoState } from "../core";
import { getPageName, isSupportedFile } from "../utils";

const _noTodoRegex = /^ *-( *).*$/d;

export async function activate(
    context: ExtensionContext,
    cortex: Map<string, Page>) {
    
    const command = 'cortex-notes.toggle-todo-state';

    const commandHandler = () => {
        
        const editor = window.activeTextEditor;

        if (!editor) {
            return;
        }

        const document = editor.document;

        if (!isSupportedFile(document)) {
            return;
        }

        const page = cortex.get(getPageName(document.uri));

        if (!page) {
            return;
        }

        const cursorPosition = editor.selection.active;
        const block = page.blocks.find(block => block.range.contains(cursorPosition));

        if (!block) {
            return;
        }

        const todoItem = block.todoItems.find(todoItem => todoItem.range.start.line === cursorPosition.line);

        if (todoItem) {
            
            switch (todoItem.state) {

                case TodoState.Todo:

                    editor.edit(editBuilder => {
                        editBuilder.replace(todoItem.range, "DONE");
                    });

                    break;
            
                case TodoState.Done:

                    const movedStart = todoItem.range.start
                        .with(undefined, todoItem.range.start.character - 1);
                    
                    const expandedRange = todoItem.range.with(movedStart);
                    
                    editor.edit(editBuilder => {
                        editBuilder.replace(expandedRange, "");
                    });
                    
                    break;
                
                default:
                    return;
            }
        }

        else {

            const line = document.lineAt(cursorPosition.line);
            const noTodoMatch = line.text.match(_noTodoRegex);

            if (!noTodoMatch) {
                return;
            }

            const offset = document.offsetAt(new Position(
                cursorPosition.line,
                0
            ));
            
            const indices = noTodoMatch.indices![1];
            const startPos = document.positionAt(offset + indices[0]);
            const endPos = document.positionAt(offset + indices[1]);
            const range = new Range(startPos, endPos);

            editor.edit(editBuilder => {
                editBuilder.replace(range, " TODO ");
            });
        }
    };
    
    context.subscriptions.push(
        commands.registerCommand(command, commandHandler));
}