import { GlobPattern, workspace } from "vscode";

export function getExcludePatterns(): GlobPattern[] {
    return [
      ...workspace.getConfiguration().get('cortex-notes.exclude-patterns', []),
      ...Object.keys(workspace.getConfiguration().get('files.exclude', {})),
    ];
}