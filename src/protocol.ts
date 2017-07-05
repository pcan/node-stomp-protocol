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
    handle: (frame: StompFrame, session: StompSession<L>) => Promise<void>
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
            async handle(frame: StompFrame, session: ServerSession) {
                await session.listener.connect(frame.headers);
            }
        },
        'SEND': {
            validators: [requireHeader('destination')],
            async handle(frame: StompFrame, session: ServerSession) {
                await session.listener.send(frame.headers);
            }
        },
        'SUBSCRIBE': {
            validators: [requireHeader('destination')],
            async handle(frame: StompFrame, session: ServerSession) {
                await session.listener.subscribe(frame.headers);
                session.data.subscriptions[frame.headers && frame.headers.destination] = true;
            }
        },
        'UNSUBSCRIBE': {
            validators: [requireOneHeader('destination', 'id')],
            async handle(frame: StompFrame, session: ServerSession) {
                const destination = frame.headers && frame.headers.destination;
                if (!session.data.subscriptions[destination]) {
                    throw new StompError(`Subscription not found for destination '${destination}'`);
                }
                delete session.data.subscriptions[destination];
                await session.listener.unsubscribe(frame.headers);
            }
        },
        'BEGIN': {
            validators: [requireHeader('transaction')],
            async handle(frame: StompFrame, session: ServerSession) {
                await session.listener.begin(frame.headers);
                session.data.transactions[frame.headers && frame.headers.transaction] = true;
            }
        },
        'COMMIT': {
            validators: [requireHeader('transaction')],
            async handle(frame: StompFrame, session: ServerSession) {
                const transaction = frame.headers && frame.headers.transaction;
                if (!session.data.transactions[transaction]) {
                    throw new StompError(`Transaction not found '${transaction}'`);
                }
                delete session.data.transactions[transaction];
                await session.listener.commit(frame.headers);
            }
        },
        'ABORT': {
            validators: [requireHeader('transaction')],
            async handle(frame: StompFrame, session: ServerSession) {
                const transaction = frame.headers && frame.headers.transaction;
                if (!session.data.transactions[transaction]) {
                    throw new StompError(`Transaction not found '${transaction}'`);
                }
                delete session.data.transactions[transaction];
                await session.listener.abort(frame.headers);
            }
        },
        'ACK': {
            validators: [requireHeader('message-id')],
            async handle(frame: StompFrame, session: ServerSession) {
                await session.listener.ack(frame.headers);
            }
        },
        'DISCONNECT': {
            validators: [],
            async handle(frame: StompFrame, session: ServerSession) {
                await session.listener.disconnect(frame.headers);
                await session.close();
            }
        }
    },
    server: {
        'CONNECTED': {
            validators: [],
            async handle(frame: StompFrame, session: ClientSession) {
                await session.listener.connected(frame.headers);
            }
        },
        'MESSAGE': {
            validators: [requireAllHeaders('destination', 'message-id')],
            async handle(frame: StompFrame, session: ClientSession) {
                await session.listener.message(frame.headers, frame.body);
            }
        },
        'RECEIPT': {
            validators: [requireHeader('receipt-id')],
            async handle(frame: StompFrame, session: ClientSession) {
                await session.listener.receipt(frame.headers);
            }
        },
        'ERROR': {
            validators: [],
            async handle(frame: StompFrame, session: ClientSession) {
                await session.listener.error(frame.headers, frame.body);
            }
        }
    }
}
