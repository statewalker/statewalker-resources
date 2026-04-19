import type { ApplicationContext } from "../../App/ApplicationContext.js";
import { getCurrentEvent, getCurrentState } from "../../lib-fsm/startProcess.js";
import { getAdapter } from "../../lib/newAdapter.js";


export function getPrinter(context: ApplicationContext): (...args: unknown[]) => void {
  return getPrintHandler(context).print;
}

//------------------------------------------------------------
// Basic Print Handler implementation
// The methods below are used during the initialization of the application.

type PrintHandler = {
  print: (...args: unknown[]) => void,
  push: (name: string) => void,
  pop: () => void,
};

export const [getPrintHandler, removePrintHandler] = getAdapter<PrintHandler, ApplicationContext>("application.printer", () => {
  const processId = Math.random().toString(16).slice(8);
  const prefix = `[${processId}]`;
  const prefixStack: string[] = [];
  // const push = () => { prefixStack.push("  "); };
  // const print = console.log.bind(console, prefix, ...prefixStack);
  // const pop = () => { prefixStack.pop(); };

  const print = console.log.bind(console, prefix);
  const push = console.group.bind(console, prefix);
  const pop = console.groupEnd.bind(console);
  return {
    print,
    push,
    pop
  }
});

//------------------------------------------------------------
// It is used in the FSM to log the current state and event when entering a new state.
export function StatePrintHandler(context: ApplicationContext) {
  const { print, push, pop } = getPrintHandler(context);
  const state = getCurrentState(context);
  const currentEvent = getCurrentEvent(context);
  push(`[${state}]`);
  print(`<${state} event="${currentEvent}">`);
  return () => {
    const currentEvent = getCurrentEvent(context);
    print(`</${state}> <!-- event="${currentEvent}" -->`);
    pop();
  };
}
