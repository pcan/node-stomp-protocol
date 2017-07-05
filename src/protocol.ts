import { StompFrame, StompHeaders, StompError, StompSessionData } from './model';
import { StompSession } from './session'
import { StompValidator, requireHeader, requireAllHeaders, requireOneHeader } from './validators'
import * as uuid from 'uuid/v4';

export interface StompServerCommands {

    connected(headers?: StompHeaders): Promise<void>;

    message(headers?: StompHeaders, body?: string): Promise<void>;
    receipt(headers?: StompHeaders): Promise<void>;
    error(headers?: StompHeaders, body?: string): Promise<void>;

}

export interface StompClientCommands {
    connect(headers?: StompHeaders): Promise<void>;

    send(headers?: StompHeaders, body?: string): Promise<void>;

    subscribe(headers?: StompHeaders): Promise<void>;
    unsubscribe(headers?: StompHeaders): Promise<void>;

    begin(headers?: StompHeaders): Promise<void>;
    commit(headers?: StompHeaders): Promise<void>;
    abort(headers?: StompHeaders): Promise<void>;

    ack(headers?: StompHeaders): Promise<void>;
    nack(headers?: StompHeaders): Promise<void>;

    disconnect(headers?: StompHeaders): Promise<void>;
}

export interface StompCommandListener {
    onProtocolError(error: StompError): void;
    onEnd(): void;
}

export interface StompClientCommandListener extends StompClientCommands, StompCommandListener {
}

export interface StompServerCommandListener extends StompServerCommands, StompCommandListener { }

type ServerSession = StompSession<StompClientCommandListener>;
type ClientSession = StompSession<StompServerCommandListener>;

export type StompCommand<L extends StompCommandListener> = {
    validators: StompValidator[],
    handle: (frame: StompFrame, session: StompSession<L>) => void
}

export type StompCommands<L extends StompCommandListener> = { [key: string]: StompCommand<L> };

export type StompProtocolHandler = {
    version: string,
    client: StompCommands<StompClientCommandListener>, // Client to server
    server: StompCommands<StompServerCommandListener> // Server to client
}

export const StompProtocolHandlerV10: StompProtocolHandler = {
    version: '1.0',
    client: {
        'CONNECT': {
            validators: [],
            handle(frame: StompFrame, session: ServerSession) {
                session.listener.connect(frame.headers);
            }
        },
        'SEND': {
            validators: [requireHeader('destination')],
            handle(frame: StompFrame, session: ServerSession) {
                session.listener.send(frame.headers);
            }
        },
        'SUBSCRIBE': {
            validators: [requireHeader('destination')],
            handle(frame: StompFrame, session: ServerSession) {

            }
        },
        'UNSUBSCRIBE': {
            validators: [requireOneHeader('destination', 'id')],
            handle(frame: StompFrame, session: ServerSession) {

            }
        },
        'BEGIN': {
            validators: [requireHeader('transaction')],
            handle(frame: StompFrame, session: ServerSession) {

            }
        },
        'COMMIT': {
            validators: [requireHeader('transaction')],
            handle(frame: StompFrame, session: ServerSession) {

            }
        },
        'ABORT': {
            validators: [requireHeader('transaction')],
            handle(frame: StompFrame, session: ServerSession) {

            }
        },
        'ACK': {
            validators: [requireHeader('message-id')],
            handle(frame: StompFrame, session: ServerSession) {

            }
        },
        'DISCONNECT': {
            validators: [],
            handle(frame: StompFrame, session: ServerSession) {
                session.listener.disconnect(frame.headers).then(() => session.close());
            }
        }
    },
    server: {
        'CONNECTED': {
            validators: [],
            handle(frame: StompFrame, session: ClientSession) {
                session.listener.connected(frame.headers);
            }
        },
        'MESSAGE': {
            validators: [requireAllHeaders('destination', 'message-id')],
            handle(frame: StompFrame, session: ClientSession) {
                session.listener.message(frame.headers, frame.body);
            }
        },
        'RECEIPT': {
            validators: [requireHeader('receipt-id')],
            handle(frame: StompFrame, session: ClientSession) {
                session.listener.receipt(frame.headers);
            }
        },
        'ERROR': {
            validators: [],
            handle(frame: StompFrame, session: ClientSession) {
                session.listener.error(frame.headers, frame.body);
            }
        }
    }
}
