import { window, TextEditorDecorationType } from "vscode";

export const pageLinkTitleDecorationType = window.createTextEditorDecorationType({
    color: '#2aa198',
    fontWeight: 'bold',
    textDecoration: 'None'
    // no so useful with solarized mode:
    // light: {
    //   backgroundColor: '#02adc422',
    // },
    // dark: {
    //   backgroundColor: '#02adc422',
    // }
});

export const transientPageLinkTitleDecorationType = window.createTextEditorDecorationType({
    color: '#004354',
    fontWeight: 'bold',
    textDecoration: 'None'
    // not so useful with solarized mode:
    // light: {
    //   backgroundColor: '#02adc422',
    // },
    // dark: {
    //   backgroundColor: '#02adc422',
    // }
});

export const pageLinkIndicatorDecorationType = window.createTextEditorDecorationType({
    color: '#004354',
    fontWeight: 'bold; font-size: 1.2em',
    letterSpacing: '0.1em',
    textDecoration: 'None'
});

export const todoDecorationType = window.createTextEditorDecorationType({
    color: '#d64004',
    fontWeight: 'bold',
    letterSpacing: '0.12em'
});

export const doneDecorationType = window.createTextEditorDecorationType({
    color: 'green',
    fontWeight: 'bold',
    letterSpacing: '0.12em'
});

/* is this approach efficient? */
export const todoDayOfWeekDecorationTypes: TextEditorDecorationType[] = [];
export const doneDayOfWeekDecorationTypes: TextEditorDecorationType[] = [];

const _weekdays = [
    'Sun',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat'
];

const _dayOfWeekDecoration = {
    color: '',
    fontWeight: 'bold',
    letterSpacing: '0.12em',
    before: {
        contentText: '',
        color: '',
        fontWeight: 'bold',
        margin: '0em 0.2em 0em 0.4em'
    }
};

for (let i = 0; i < _weekdays.length; i++) {
    _dayOfWeekDecoration.before.contentText = _weekdays[i];
    _dayOfWeekDecoration.color = '#d64004';
    _dayOfWeekDecoration.before.color = '#d64004';
    todoDayOfWeekDecorationTypes[i] = window.createTextEditorDecorationType(_dayOfWeekDecoration);
}

for (let i = 0; i < _weekdays.length; i++) {
    _dayOfWeekDecoration.before.contentText = _weekdays[i];
    _dayOfWeekDecoration.color = 'green';
    _dayOfWeekDecoration.before.color = 'green';
    doneDayOfWeekDecorationTypes[i] = window.createTextEditorDecorationType(_dayOfWeekDecoration);
}