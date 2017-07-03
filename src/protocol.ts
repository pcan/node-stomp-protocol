import { StompFrame, StompHeaders, StompError } from './model';
import { StompFrameLayer } from './frame';

abstract class StompProtocolLayer<L extends StompProtocolListener> {

    constructor(protected frameLayer: StompFrameLayer, protected validators: StompValidators, public listener: L) {
        frameLayer.emitter.on('frame', (frame) => this.checkFrame(frame));
        frameLayer.emitter.on('error', (error) => this.listener && this.listener.onProtocolError(error));
        frameLayer.emitter.on('end', () => this.listener && this.listener.onEnd());
    }

    private checkFrame(frame: StompFrame) {
        if (this.isValidCommand(frame.command)) {
            const validate = this.validators[frame.command];
            const validation = validate(frame);
            if (validation.isValid) {
                this.onFrame(frame);
            } else {
                this.onFrameError(new StompError(validation.message, validation.details));
            }
        } else {
            this.onFrameError(new StompError('No such command', `Unrecognized Command '${frame.command}'`));
        }
    }

    protected abstract onFrame(frame: StompFrame): void;

    protected abstract onFrameError(error: StompError): void;

    private isValidCommand(command: string) {
        return (command && command.length < 20 && this.validators[command]);
    }

}


class StompServerImpl extends StompProtocolLayer<StompClientProtocolListener> implements StompServer {

    constructor(frameLayer: StompFrameLayer, listener: StompClientProtocolListener) {
        super(frameLayer, {}, listener);
    }

    protected onFrame(frame: StompFrame) {

    }

    protected onFrameError(error: StompError) {
        //TODO: send error to client
    }

    connected() { }

    message() { }
    receipt() { }
    error() { }

}



interface StompServerCommands {

    connected(): void;

    message(): void;
    receipt(): void;
    error(): void;

}

interface StompClientCommands {
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

interface StompProtocolListener {
    onProtocolError(error: StompError): void;
    onEnd(): void;
}

export interface StompServerProtocolListener extends StompServerCommands, StompProtocolListener {
}

export interface StompClientProtocolListener extends StompClientCommands, StompProtocolListener {
}

export interface StompServer extends StompServerCommands {
    listener: StompClientProtocolListener;
}

export interface StompClient extends StompServerCommands {
    listener: StompServerProtocolListener;
}

interface StompSession {
    id?: string;
    authenticated: boolean;
}

interface StompValidationResult {
    isValid: boolean;
    message?: string;
    details?: string;
};

type StompValidator = (frame: StompFrame, session?: StompSession) => StompValidationResult;
type StompValidators = { [command: string]: StompValidator };

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
