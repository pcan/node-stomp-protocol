import { StompFrame, StompError } from './model';
import { StompFrameLayer } from './frame'


interface StompSession {
    id?: string;
    authenticated?: boolean;
}


interface StompBaseCommands {

    //frameError(error: StompFrameError): void;
    //end(): void;

}


interface StompClientCommands extends StompBaseCommands {

    connect(frame: StompFrame): void;

    send(frame: StompFrame): void;

    subscribe(frame: StompFrame): void;
    unsubscribe(frame: StompFrame): void;

    begin(frame: StompFrame): void;
    commit(frame: StompFrame): void;
    abort(frame: StompFrame): void;

    ack(frame: StompFrame): void;
    nack(frame: StompFrame): void;

    disconnect(frame: StompFrame): void;

}


interface StompServerCommands extends StompBaseCommands {

    connected(sessionId: string): void;

    message(frame: StompFrame): void;
    receipt(frame: StompFrame): void;
    error(frame: StompFrame): void;

}


interface StompCommandHandler<L extends StompBaseCommands> {

    validate: (frame: StompFrame) => StompValidationResult;
    handle(frame: StompFrame, session: StompSession, listener: L): void;

}


type StompCommands<L extends StompBaseCommands> = { [command: string]: StompCommandHandler<L> };

type StompProtocol = {
    version: string,
    client: StompCommands<StompClientCommands>,
    server: StompCommands<StompServerCommands>
};

type StompSide = 'server' | 'client';


/**
 * Commands sent by client to server
 */
/*type StompClientCommand = 'CONNECT' | 'STOMP' | 'SEND' | 'SUBSCRIBE' |
    'UNSUBSCRIBE' | 'BEGIN' | 'COMMIT' | 'ABORT' |
    'ACK' | 'NACK' | 'DISCONNECT' | string;
*/
/**
 * Commands sent by server to client
 */
// type StompServerCommand = 'CONNECTED' | 'MESSAGE' | 'RECEIPT' | 'ERROR'| string;

// type StompCommand = StompClientCommand | StompServerCommand;



const StompProtocolV10: StompProtocol = {
    version: '1.0',
    client: {
        // 'CONNECT': {
        //     validate: requireAllHeaders('accept-version', 'host'),
        //     handle: (frame, session, listener) => listener.connect(frame)
        // }
    },
    server: {
        // 'CONNECTED': {
        // }
    }
};


abstract class StompProtocolLayer<L extends StompBaseCommands> {

    protected session: StompSession = {};
    private allowedCommandNames: string[];
    public protocolListener: L;

    private _protocol: StompProtocol;

    protected get commands() {
        return this._protocol[this.side];
    }

    protected set protocol(p: StompProtocol) {
        this._protocol = p;
        this.allowedCommandNames = Object.keys(this.commands);
    }

    protected get protocol() {
        return this._protocol;
    }

    constructor(protected readonly frameLayer: StompFrameLayer, protocol: StompProtocol, private readonly side: StompSide) {
        frameLayer.emitter.on('frame', (frame) => this.onFrame(frame));
        frameLayer.emitter.on('error', (error) => this.onError(error));
        frameLayer.emitter.on('end', () => this.onEnd());
        this.protocol = protocol;
    }

    private onFrame(frame: StompFrame) {
        if (this.isValidCommand(frame.command)) {
            const handler = this.commands[frame.command];
            const validation = handler.validate(frame);
            if (validation.isValid) {
                //handler.handle(frame, this.session, this.protocolListener);
            } else {
                this.onError(new StompError(validation.message, validation.details));
            }
        } else {
            this.onError(new StompError('No such command', `Unrecognized Command '${frame.command}'`));
        }
    }

    private isValidCommand(command: string) {
        return (command && command.length < 20 && this.allowedCommandNames.indexOf(command) > -1);
    }

    private onError(error: StompError) {
        //this.protocolListener.frameError(error);
    }

    private onEnd() {
        //this.protocolListener.end();
    }

}


export class StompServer extends StompProtocolLayer<StompClientCommands> implements StompServerCommands {

    constructor(frameLayer: StompFrameLayer) {
        super(frameLayer, StompProtocolV10, 'client');
    }


    connected(sessionId: string) {
        this.session.authenticated = true;
        this.session.id = sessionId;
        this.frameLayer.send(new StompFrame('CONNECTED', {
            session: sessionId, //TODO: server...
        }));
    }

    message(frame: StompFrame) { }
    receipt(frame: StompFrame) { }
    error(frame: StompFrame) { }


}



type StompValidationResult = {
    isValid: boolean,
    message?: string,
    details?: string
};


const validationOk: StompValidationResult = { isValid: true };

function isPresent(value: any) {
    return typeof value !== 'undefined' && value !== null;
}

function requireHeader(headerName: string) {
    return (frame: StompFrame) => {
        if (isPresent(frame.headers[headerName])) {
            return validationOk;
        }
        return {
            isValid: false,
            message: `Header '${headerName}' is required for ${frame.command}`,
            details: 'Frame: ' + frame.toString()
        };;
    };
}

function requireOneHeader(...headerNames: string[]) {
    return (frame: StompFrame) => {
        for (var headerName in headerNames) {
            if (isPresent(frame.headers[headerName])) {
                return validationOk;
            }
        }
        return {
            isValid: false,
            message: `One of the following Headers '${headerNames.join(', ')}' is \
                required for ${frame.command}`,
            details: 'Frame: ' + frame.toString()
        };
    };
}

function requireAllHeaders(...headerNames: string[]) {
    return (frame: StompFrame) => {
        for (var headerName in headerNames) {
            if (!isPresent(frame.headers[headerName])) {
                return {
                    isValid: false,
                    message: `Header '${headerName}' is required for ${frame.command}`,
                    details: 'Frame: ' + frame.toString()
                };
            }
        }
        return validationOk;
    };
}

function headerMatchesRegex(headerName: string, regex: RegExp) {
    return (frame: StompFrame) => {
        var headerValue = frame.headers[headerName];
        if (typeof headerValue !== 'string' || !headerValue.match(regex)) {
            return {
                isValid: false,
                message: `Header '${headerName}' has value '${headerValue}' which \
                    does not match against the following regex: \
                    '${regex}'`,
                details: 'Frame: ' + frame.toString()
            };
        }
        return validationOk;
    };
}


/*
export const StompProtocol_v_1_0: StompProtocol = {
    version: '1.0',
    serverCommands: {
        CONNECT: [],
        SEND: [requireHeader('destination')],
        SUBSCRIBE: [requireHeader('destination')],
        UNSUBSCRIBE: [requireOneHeader('destination', 'id')],
        BEGIN: [requireHeader('transaction')],
        COMMIT: [requireHeader('transaction')],
        ABORT: [requireHeader('transaction')],
        ACK: [requireHeader('message-id')],
        DISCONNECT: []
    },
    clientCommands: {
        CONNECTED: [],
        MESSAGE: [requireAllHeaders('destination', 'message-id')],
        RECEIPT: [requireHeader('receipt-id')],
        ERROR: []
    }
}




export const StompProtocol_v_1_1: StompProtocol = {
    version: '1.1',
    serverCommands: {
        CONNECT: [requireAllHeaders('accept-version', 'host')],
        STOMP: [requireAllHeaders('accept-version', 'host')],
        SEND: StompProtocol_v_1_0.serverCommands.SEND,
        SUBSCRIBE: [requireAllHeaders('destination', 'id')],
        UNSUBSCRIBE: [requireHeader('id')],
        BEGIN: StompProtocol_v_1_0.serverCommands.BEGIN,
        COMMIT: StompProtocol_v_1_0.serverCommands.COMMIT,
        ABORT: StompProtocol_v_1_0.serverCommands.ABORT,
        ACK: [requireAllHeaders('message-id', 'subscription')],
        NACK: [requireAllHeaders('message-id', 'subscription')],
        DISCONNECT: StompProtocol_v_1_0.serverCommands.DISCONNECT
    },
    clientCommands: {
        CONNECTED: [requireHeader('version')],
        MESSAGE: [requireAllHeaders('destination', 'message-id', 'subscription')],
        RECEIPT: StompProtocol_v_1_0.clientCommands.RECEIPT,
        ERROR: StompProtocol_v_1_0.clientCommands.ERROR
    }
}

export const StompProtocol_v_1_2: StompProtocol = {
    version: '1.1',
    serverCommands: {
        CONNECT: StompProtocol_v_1_1.serverCommands.CONNECT,
        STOMP: StompProtocol_v_1_1.serverCommands.STOMP,
        SEND: StompProtocol_v_1_1.serverCommands.SEND,
        SUBSCRIBE: StompProtocol_v_1_1.serverCommands.SUBSCRIBE,
        UNSUBSCRIBE: StompProtocol_v_1_1.serverCommands.UNSUBSCRIBE,
        BEGIN: StompProtocol_v_1_1.serverCommands.BEGIN,
        COMMIT: StompProtocol_v_1_1.serverCommands.COMMIT,
        ABORT: StompProtocol_v_1_1.serverCommands.ABORT,
        ACK: [requireHeader('id')],
        NACK: [requireHeader('id')],
        DISCONNECT: StompProtocol_v_1_1.serverCommands.DISCONNECT
    },
    clientCommands: {
        CONNECTED: StompProtocol_v_1_1.clientCommands.CONNECTED,
        MESSAGE: StompProtocol_v_1_1.clientCommands.MESSAGE,
        RECEIPT: StompProtocol_v_1_1.clientCommands.RECEIPT,
        ERROR: StompProtocol_v_1_1.clientCommands.ERROR
    }
}
*/
