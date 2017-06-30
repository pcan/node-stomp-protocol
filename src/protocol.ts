import { StompFrame, StompProtocol, validationOk } from './model';

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
        CONNECTED: [requireHeader('session')],
        SEND: [requireAllHeaders('destination', 'message-id')],
        RECEIPT: [requireHeader('receipt-id')],
        ERROR: [requireHeader('message')]
    }
}
