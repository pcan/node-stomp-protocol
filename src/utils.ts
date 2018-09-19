export type LoggerFunction = (message: string, ...args: any[]) => any;

export interface StompProtocolLoggingListeners {

    readonly error: LoggerFunction;
    readonly warn: LoggerFunction;
    readonly info: LoggerFunction;
    readonly debug: LoggerFunction;
    readonly silly: LoggerFunction;

}

let loggingListeners: StompProtocolLoggingListeners | null = null;

export function promiseRejectionHandler(className: string, functionName: string) {
    const location = `${className}: promise rejection in '${functionName}'`;
    return (e: Error) => log.debug(location, e);
}

export function setLoggingListeners(listeners: StompProtocolLoggingListeners) {
    loggingListeners = listeners;
}

function noop(){ }

class Logging implements StompProtocolLoggingListeners {

    get error() {
        return loggingListeners ? loggingListeners.error : noop;
    }

    get warn() {
        return loggingListeners ? loggingListeners.warn : noop;
    }

    get info() {
        return loggingListeners ? loggingListeners.info : noop;
    }

    get debug() {
        return loggingListeners ? loggingListeners.debug : noop;
    }

    get silly() {
        return loggingListeners ? loggingListeners.silly : noop;
    }

}

export const log = new Logging() as StompProtocolLoggingListeners;

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
