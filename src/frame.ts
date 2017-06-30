import { StompFrame, StompProtocol, StompCommands, StompEventEmitter, validationOk } from "./model";
import { StompStreamLayer } from "./stream";
import { EventEmitter } from "events";


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

export class StompFrameEventEmitter {

    private readonly emitter = new EventEmitter();
    public readonly frameEmitter = new StompEventEmitter(this.emitter, 'frame');
    public readonly errorEmitter = new StompEventEmitter(this.emitter, 'error');
    public readonly endEmitter = new StompEventEmitter(this.emitter, 'end');

}


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

    public readonly emitter = new StompFrameEventEmitter();

    private frame: StompFrame;
    private contentLength: number;
    private buffer = '';
    private status: StompFrameStatus = StompFrameStatus.COMMAND;

    constructor(private readonly stream: StompStreamLayer, private readonly validator: StompFrameValidator) {
        stream.emitter.dataEmitter.onEvent((data: string) => this.onData(data));
        stream.emitter.endEmitter.onEvent(() => this.onEnd());
    }

    public send(frame: StompFrame) {
        var data = frame.command + '\n';
        for (var key in frame.headers) {
            data += key + ':' + frame.headers[key] + '\n';
        }
        if (frame.body.length > 0) {
            if (!frame.headers.hasOwnProperty('suppress-content-length')) {
                data += 'content-length:' + Buffer.byteLength(frame.body) + '\n';
            }
        }
        data += '\n';
        if (frame.body.length > 0) {
            data += frame.body;
        }
        data += '\0';
        if (frame) {
            this.stream.send(data);
        }
    }


    private onData(data: string) {
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

    private onEnd() {
        this.emitter.endEmitter.emit();
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
                this.incrementStatus();
                break;
            }
        }
    }

    private parseHeaders() {
        var value;
        while (this.hasLine()) {
            var headerLine = this.popLine();
            if (headerLine === '') {
                this.incrementStatus();
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
                this.emitter.frameEmitter.emit(this.frame); // Event emit to catch any frame emission
                //this.emit(this.frame.command, this.frame);  // Specific frame emission
            } else {
                this.emitter.errorEmitter.emit(new StompFrameError(validation.message, validation.details));
            }

            this.incrementStatus();
            this.buffer = this.buffer.substr(index + 1);
        }
    }

    /**
     * Parses the error
     */
    private parseError() {
        var index = this.buffer.indexOf('\0');
        if (index > -1) {
            this.buffer = this.buffer.substr(index + 1);
            this.incrementStatus();
        } else {
            this.buffer = '';
        }
    }

    /**
     * Pops a new line from the stream
     * @return {string} the new line available
     */
    private popLine() {
        //TODO: security check for newline char flooding
        var index = this.buffer.indexOf('\n');
        var line = this.buffer.slice(0, index);
        this.buffer = this.buffer.substr(index + 1);
        return line;
    }

    /**
     * Check if there is a new line in the current stream chunk
     * @return {boolean}
     */
    private hasLine() {
        return (this.buffer.indexOf('\n') > -1);
    }

    /**
     * Emits a new StompFrameError and sets the current status to ERROR
     * @param  {StompFrameError} error
     */
    private error(error: StompFrameError) {
        this.emitter.errorEmitter.emit(error);
        this.status = StompFrameStatus.ERROR;
    }

    /**
     * Set the current status to the next available, otherwise it returns in COMMAND status.
     */
    private incrementStatus() {
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
