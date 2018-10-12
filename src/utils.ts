import { Socket } from "net";

export type LoggerFunction = (message: string, ...args: any[]) => any;

const logLevels: Array<keyof StompProtocolLoggingListeners> = ['error', 'warn', 'info', 'debug', 'silly'];
export interface StompProtocolLoggingListeners {

    readonly error: LoggerFunction;
    readonly warn: LoggerFunction;
    readonly info: LoggerFunction;
    readonly debug: LoggerFunction;
    readonly silly: LoggerFunction;

}

function noopLoggingListeners() {
    const loggingListeners = {} as StompProtocolLoggingListeners;
    for (let level of logLevels) {
        Object.defineProperty(loggingListeners, level, {
            writable: false,
            value: noop
        });
    }
    return loggingListeners;
}

const loggingListeners = noopLoggingListeners();

// Currently unused
// export function promiseRejectionHandler(className: string, functionName: string) {
//     const location = `${className}: promise rejection in '${functionName}'`;
//     return (e: Error) => log.debug(location, e);
// }

export function setLoggingListeners(listeners: StompProtocolLoggingListeners) {
    for (let level of logLevels) {
        Object.defineProperty(loggingListeners, level, {
            writable: false,
            value: (message: string, ...args: any[]) => {
                try {
                    return listeners[level](message, ...args);
                } catch (e) {
                    // we cannot do nothing here.
                }
            }
        });
    }
}

export type GenericSocket = Socket | WebSocket;

export const counter = (i = 0) => () => (i++).toString();

function noop() { }

export const log = loggingListeners;

export type WebSocketMessageHandler = (event: { data: any; type: string; target: WebSocket }) => void;

export interface WebSocket {

    addEventListener(method: 'message', cb?: WebSocketMessageHandler): void;
    addEventListener(method: 'close', cb?: (event: any) => void): void;
    addEventListener(method: 'error', cb?: (event: any) => void): void;
    removeEventListener(method: 'message', cb?: WebSocketMessageHandler): void;
    removeEventListener(method: 'close', cb?: (event: any) => void): void;
    removeEventListener(method: 'error', cb?: (event: any) => void): void;
    close(code?: number, data?: string): void;
    send(data: any, cb?: (err?: Error) => void): void;

}
