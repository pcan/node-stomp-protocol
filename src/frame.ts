import { StompFrame, StompProtocol, StompCommands, StompEventEmitter, validationOk } from "./model";
import { StompStreamLayer } from "./stream";


/*
var server = net.createServer((socket) => {
    socket.on('connect', () => {
        //console.log('Received Unsecured Connection');
        //new StompStreamHandler(stream, queueManager);
        var stream = new StompStream(socket);
        var handler = new StompProtocolHandler(stream);

    });
});
*/


export class StompFrameError extends Error {

    constructor(message?: string, public details?: string) {
        super(message);
    }
}


enum StompFrameStatus {
    COMMAND = 0,
    HEADERS = 1,
    BODY = 2,
    ERROR = 3
}

class StompFrameLayer {

    public readonly emitter: StompEventEmitter<'frame' | 'error'> = new StompEventEmitter();
    private contentLength: number;
    private buffer = '';
    private frame: StompFrame;
    private status: StompFrameStatus = StompFrameStatus.COMMAND;

    constructor(private readonly stream: StompStreamLayer,  private readonly validator: StompFrameValidator) {
        stream.emitter.onEvent('streamData', (data: string) => this.onData(data));
        stream.emitter.onEvent('streamEnd', () => this.onEnd());
    }

    public onData(data: string) {
        this.buffer += data;
        do {
            if (this.status === StompFrameStatus.COMMAND) {
                this.parseCommand();
            }
            if (this.status === StompFrameStatus.HEADERS) {
                this.parseHeaders();
            }
            if (this.status === StompFrameStatus.BODY) {
                this.parseBody();
            }
            if (this.status === StompFrameStatus.ERROR) {
                this.parseError();
            }
            //waiting for further commands, there is other data remaining
        } while (this.status === StompFrameStatus.COMMAND && this.hasLine());
    }

    public onEnd() {
        //TODO
    }

    private parseCommand() {
        while (this.hasLine()) {
            var commandLine = this.popLine();
            if (commandLine !== '') {
                if (!this.validator.isValidCommand(commandLine)) {
                    this.error(new StompFrameError('No such command', `Unrecognized Command '${commandLine}'`));
                    break;
                }
                this.frame = new StompFrame(commandLine);
                this.contentLength = -1;
                this.incrementState();
                break;
            }
        }
    }

    private parseHeaders() {
        var value;
        while (this.hasLine()) {
            var headerLine = this.popLine();
            if (headerLine === '') {
                this.incrementState();
                break;
            } else {
                var kv = headerLine.split(':');
                if (kv.length < 2) {
                    this.error(new StompFrameError('Error parsing header', `No ':' in line '${headerLine}'`));
                    break;
                }
                value = kv.slice(1).join(':');
                this.frame.setHeader(kv[0], value);
                if (kv[0].toLowerCase() === 'content-length') {
                    this.contentLength = parseInt(value);
                }
            }
        }
    }

    private parseBody() { //TODO: security check for length (watch appendToBody)
        var bufferBuffer = new Buffer(this.buffer);

        if (this.contentLength > -1) {
            var remainingLength = this.contentLength - this.frame.body.length;

            if (remainingLength < bufferBuffer.length) {
                this.frame.appendToBody(bufferBuffer.slice(0, remainingLength).toString());
                this.buffer = bufferBuffer.slice(remainingLength, bufferBuffer.length).toString();

                if (this.contentLength === Buffer.byteLength(this.frame.body)) {
                    this.contentLength = -1;
                } else {
                    return;
                }
            }
        }

        var index = this.buffer.indexOf('\0');

        if (index == -1) {
            this.frame.appendToBody(this.buffer);
            this.buffer = '';
        } else {
            // The end of the frame has been identified, finish creating it
            this.frame.appendToBody(this.buffer.slice(0, index));

            var validation = this.validator.validate(this.frame);

            if (validation.isValid) {
                // Emit the frame and reset
                this.emitter.emitEvent('frame', this.frame); // Event emit to catch any frame emission
                //this.emit(this.frame.command, this.frame);  // Specific frame emission
            } else {
                this.emitter.emitEvent('error', new StompFrameError(validation.message, validation.details));
            }

            //this.frame = new StompFrame();
            this.incrementState();
            this.buffer = this.buffer.substr(index + 1);
        }
    }

    private parseError() {
        var index = this.buffer.indexOf('\0');
        if (index > -1) {
            this.buffer = this.buffer.substr(index + 1);
            this.incrementState();
        } else {
            this.buffer = "";
        }
    }

    private popLine() {
        //TODO: security check for newline flooding
        var index = this.buffer.indexOf('\n');
        var line = this.buffer.slice(0, index);
        this.buffer = this.buffer.substr(index + 1);
        return line;
    }

    private hasLine() {
        return (this.buffer.indexOf('\n') > -1);
    }

    private error(error: StompFrameError) {
        this.emitter.emitEvent('error', error);
        this.status = StompFrameStatus.ERROR;
    }

    private incrementState() {
        if (this.status === StompFrameStatus.BODY || this.status === StompFrameStatus.ERROR) {
            this.status = StompFrameStatus.COMMAND;
        } else {
            this.status++;
        }
    }

}


export enum StompSide {
    SERVER,
    CLIENT
}


export class StompFrameValidator {

    private readonly allowedCommands: StompCommands;
    private readonly allowedCommandNames: string[];

    constructor(private readonly side: StompSide, private protocol: StompProtocol) {
        this.allowedCommands = this.side === StompSide.CLIENT ?
            this.protocol.clientCommands :
            this.protocol.serverCommands;
        this.allowedCommandNames = Object.keys(this.allowedCommands);
    }

    public isValidCommand(command: string) {
        return (command && (command.length < 20 || this.allowedCommandNames.indexOf(command) > -1));
    }

    public validate(frame: StompFrame) {
        const validators = this.allowedCommands[frame.command];
        var result;
        for (var validator of validators) {
            result = validator(frame);
            if (!result.isValid) {
                return result;
            }
        }
        return validationOk;
    }

}
