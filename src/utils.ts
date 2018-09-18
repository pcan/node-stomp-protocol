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

export interface WebSocket {

    on(event: 'message', listener: (this: WebSocket, data: WebSocketData) => void): this;
    on(event: 'error', listener: (this: WebSocket, err: Error) => void): this;
    on(event: 'close', listener: (this: WebSocket, code: number, reason: string) => void): this;
    close(code?: number, data?: string): void;
    send(data: any, cb?: (err: Error) => void): void;

}

export type WebSocketData = string | Buffer | ArrayBuffer | Buffer[];
