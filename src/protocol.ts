import { StompFrame, StompError } from './model';
import { StompSession } from './session'
import { StompValidator } from './validators'

export interface StompServerCommandListener extends StompCommandListener {

    connected(): void;

    message(): void;
    receipt(): void;
    error(): void;

}

export interface StompClientCommandListener extends StompCommandListener {
    connect(): void;

    send(): void;

    subscribe(): void;
    unsubscribe(): void;

    begin(): void;
    commit(): void;
    abort(): void;

    ack(): void;
    nack(): void;

    disconnect(): void;
}

export interface StompCommandListener {
    onProtocolError(error: StompError): void;
    onEnd(): void;
}

type ServerSession = StompSession<StompClientCommandListener>;
type ClientSession = StompSession<StompServerCommandListener>;

export type StompCommand<L extends StompCommandListener> = {
    validators: StompValidator[],
    handle: (frame: StompFrame, session: StompSession<L>) => void
}

export type StompCommands<L extends StompCommandListener> = { [key: string]: StompCommand<L> };

export type StompProtocolHandler = {
    version: string,
    client: StompCommands<StompClientCommandListener>,
    server: StompCommands<StompServerCommandListener>
}

export const StompProtocolHandlerV10: StompProtocolHandler = {
    version: '1.0',
    client: {
        'CONNECT': {
            validators: [],
            handle(frame: StompFrame, session: ServerSession) {

            }
        }
    },
    server: {
        'CONNECTED': {
            validators: [],
            handle(frame: StompFrame, session: ClientSession) {

            }
        }
    }
}
