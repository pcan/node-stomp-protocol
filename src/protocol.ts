import { StompFrame, StompHeaders, StompError, StompSessionData } from './model';
import { StompSession } from './session'
import { StompValidator, requireHeader, requireAllHeaders, requireOneHeader } from './validators'

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
        CONNECT: {
            validators: [],
            async handle(frame: StompFrame, session: ServerSession) {
                await session.listener.connect(frame.headers);
            }
        },
        SEND: {
            validators: [requireHeader('destination')],
            async handle(frame: StompFrame, session: ServerSession) {
                await session.listener.send(frame.headers);
            }
        },
        SUBSCRIBE: {
            validators: [requireHeader('destination')],
            async handle(frame: StompFrame, session: ServerSession) {
                await session.listener.subscribe(frame.headers);
                const destination = getDestinationKey(frame.headers);
                session.data.subscriptions[destination] = true;
            }
        },
        UNSUBSCRIBE: {
            validators: [requireOneHeader('destination', 'id')],
            async handle(frame: StompFrame, session: ServerSession) {
                const destination = getDestinationKey(frame.headers);
                if (!session.data.subscriptions[destination]) {
                    throw new StompError(`Subscription not found for destination '${destination}'`);
                }
                delete session.data.subscriptions[destination];
                await session.listener.unsubscribe(frame.headers);
            }
        },
        BEGIN: {
            validators: [requireHeader('transaction')],
            async handle(frame: StompFrame, session: ServerSession) {
                await session.listener.begin(frame.headers);
                session.data.transactions[frame.headers && frame.headers.transaction] = true;
            }
        },
        COMMIT: {
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
        ABORT: {
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
        ACK: {
            validators: [requireHeader('message-id')],
            async handle(frame: StompFrame, session: ServerSession) {
                await session.listener.ack(frame.headers);
            }
        },
        DISCONNECT: {
            validators: [],
            async handle(frame: StompFrame, session: ServerSession) {
                await session.listener.disconnect(frame.headers);
                await session.close();
            }
        }
    },
    server: {
        CONNECTED: {
            validators: [],
            async handle(frame: StompFrame, session: ClientSession) {
                await session.listener.connected(frame.headers);
            }
        },
        MESSAGE: {
            validators: [requireAllHeaders('destination', 'message-id')],
            async handle(frame: StompFrame, session: ClientSession) {
                await session.listener.message(frame.headers, frame.body);
            }
        },
        RECEIPT: {
            validators: [requireHeader('receipt-id')],
            async handle(frame: StompFrame, session: ClientSession) {
                await session.listener.receipt(frame.headers);
            }
        },
        ERROR: {
            validators: [],
            async handle(frame: StompFrame, session: ClientSession) {
                await session.listener.error(frame.headers, frame.body);
            }
        }
    }
}

export const StompProtocolHandlerV11: StompProtocolHandler = {
    version: '1.1',
    client: {
        CONNECT: {
            validators: [requireAllHeaders('accept-version', 'host')],
            handle: StompProtocolHandlerV10.client.CONNECT.handle,
        },
        STOMP: {
            validators: [requireAllHeaders('accept-version', 'host')],
            handle: StompProtocolHandlerV10.client.CONNECT.handle,
        },
        SEND: StompProtocolHandlerV10.client.SEND,
        SUBSCRIBE: {
            validators: [requireAllHeaders('destination', 'id')],
            handle: StompProtocolHandlerV10.client.SUBSCRIBE.handle,
        },
        UNSUBSCRIBE: {
            validators: [requireHeader('id')],
            handle: StompProtocolHandlerV10.client.UNSUBSCRIBE.handle,
        },
        BEGIN: StompProtocolHandlerV10.client.BEGIN,
        COMMIT: StompProtocolHandlerV10.client.COMMIT,
        ABORT: StompProtocolHandlerV10.client.ABORT,
        ACK: {
            validators: [requireAllHeaders('message-id', 'subscription')],
            handle: StompProtocolHandlerV10.client.ACK.handle,
        },
        NACK: {
            validators: [requireAllHeaders('message-id', 'subscription')],
            async handle(frame: StompFrame, session: ServerSession) {
                await session.listener.nack(frame.headers);
            }
        },
        DISCONNECT: StompProtocolHandlerV10.client.DISCONNECT
    },
    server: {
        CONNECTED: {
            validators: [requireHeader('version')],
            handle: StompProtocolHandlerV10.server.CONNECTED.handle
        },
        MESSAGE: {
            validators: [requireAllHeaders('destination', 'message-id', 'subscription')],
            handle: StompProtocolHandlerV10.server.MESSAGE.handle
        },
        RECEIPT: StompProtocolHandlerV10.server.RECEIPT,
        ERROR: StompProtocolHandlerV10.server.ERROR
    }
}


export const StompProtocolHandlerV12: StompProtocolHandler = {
    version: '1.2',
    client: {
        CONNECT: StompProtocolHandlerV11.client.CONNECT,
        STOMP: StompProtocolHandlerV11.client.STOMP,
        SEND: StompProtocolHandlerV11.client.SEND,
        SUBSCRIBE: StompProtocolHandlerV11.client.SUBSCRIBE,
        UNSUBSCRIBE: StompProtocolHandlerV11.client.UNSUBSCRIBE,
        BEGIN: StompProtocolHandlerV11.client.BEGIN,
        COMMIT: StompProtocolHandlerV11.client.COMMIT,
        ABORT: StompProtocolHandlerV11.client.ABORT,
        ACK: {
            validators: [requireHeader('id')],
            handle: StompProtocolHandlerV11.client.ACK.handle
        },
        NACK: {
            validators: [requireHeader('id')],
            handle: StompProtocolHandlerV11.client.NACK.handle
        },
        DISCONNECT: StompProtocolHandlerV11.client.DISCONNECT
    },
    server: {
        CONNECTED: StompProtocolHandlerV11.server.CONNECTED,
        MESSAGE: StompProtocolHandlerV11.server.MESSAGE,
        RECEIPT: StompProtocolHandlerV11.server.RECEIPT,
        ERROR: StompProtocolHandlerV11.server.ERROR
    }
}


function getDestinationKey(headers: StompHeaders) {
    if (headers.id) {
        return 'id-' + headers.id;
    }
    if (headers.destination) {
        return 'dest-' + headers.destination;
    }
    throw new StompError('You must specify destination or id header.');
}
