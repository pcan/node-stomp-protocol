import { StompFrame, StompProtocol, validationOk } from './model';
import { headerMatchesRegex, requireAllHeaders, requireHeader, requireOneHeader } from './validators';





export class StompProtocolLayer {

}





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
