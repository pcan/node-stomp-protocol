import { EventEmitter } from "events";

export type StompHeaders = { [key: string]: string | number };

export class StompFrame {

    public headers: StompHeaders;
    public body: string;

    constructor(readonly command: string, headers?: StompHeaders, body?: string) {
        this.body = body || '';
        this.headers = headers || {};
    }

    public setHeader(key: string, value: string | number) {
        this.headers[key] = value;
    }

    public appendToBody(data: string) {
        this.body += data;
    }

    public toString() {
        return JSON.stringify(this);
    }
}

export class StompEventEmitter<E extends string> {

    private readonly emitter = new EventEmitter();

    public on(event: E, callback: (...args: any[]) => void) {
        this.emitter.on(event, callback);
    }

    public emit(event: E, ...args: any[]) {
        this.emitter.emit(event, ...args);
    }

}

type StompValidationResult = {
    isValid: boolean,
    message?: string,
    details?: string
};


export const validationOk: StompValidationResult = { isValid: true };

type StompValidator = ((frame: StompFrame) => StompValidationResult);

export type StompCommands = {
    [commandName: string]: StompValidator[]
};

export type StompProtocol = {
    version: string,
    serverCommands: StompCommands,
    clientCommands: StompCommands
}
