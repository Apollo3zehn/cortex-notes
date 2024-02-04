import { window } from "vscode";

export const pageLinkTitleDecorationType = window.createTextEditorDecorationType({
    color: "#2aa198",
    fontWeight: "bold",
    textDecoration: "None"
    // no so useful with solarized mode:
    // light: {
    //   backgroundColor: '#02adc422',
    // },
    // dark: {
    //   backgroundColor: '#02adc422',
    // }
});

export const pageLinkIndicatorDecorationType = window.createTextEditorDecorationType({
    color: "#004354",
    fontWeight: "bold; font-size: 1.2em",
    letterSpacing: "0.1em",
    textDecoration: "None"
});