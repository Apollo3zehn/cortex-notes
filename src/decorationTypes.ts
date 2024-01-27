import { window } from "vscode";

export const linkDecorationType = window.createTextEditorDecorationType({
    color: "#2aa198",
    fontWeight: "bold"
    // no so useful in solarized style:
    // light: {
    //   backgroundColor: '#02adc422',
    // },
    // dark: {
    //   backgroundColor: '#02adc422',
    // }
});