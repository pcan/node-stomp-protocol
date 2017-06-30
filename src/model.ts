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

    constructor(private readonly emitter: EventEmitter, private readonly event: string) { }

    public onEvent(callback: (...args: any[]) => void) {
        this.emitter.on(this.event, callback);
    }

    public emit(...args: any[]) {
        this.emitter.emit(this.event, ...args);
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
