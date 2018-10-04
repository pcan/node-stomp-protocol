import { EventEmitter } from "events";
import { IHeartbeatOptions } from "./heartbeat";

export type StompHeaders = { [key: string]: string };

export interface StompConfig {
    connectTimeout?: number;
    newlineFloodingResetTime?: number;
    headersFilter?: (headerName: string) => boolean;
    heartbeat?: IHeartbeatOptions;
}

export class StompSessionData {
    id: string | null = null;
    authenticated = false;
    subscriptions: { [key: string]: boolean } = {};
    transactions: { [key: string]: boolean } = {};
}

export class StompError extends Error {

    constructor(message?: string, public details?: string) {
        super(message);
    }

}

export class StompFrame {

    public headers: StompHeaders;
    public body: string;

    constructor(readonly command: string, headers?: StompHeaders, body?: string) {
        this.body = body || '';
        this.headers = headers || {};
    }

    public setHeader(key: string, value: string) {
        this.headers[key] = value;
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

/*
type StompValidator = ((frame: StompFrame) => StompValidationResult);

type StompCommands = {
    [commandName: string]: StompValidator[]
};

export type StompProtocol = {
    version: string,
    serverCommands: StompCommands,
    clientCommands: StompCommands
}

*/
