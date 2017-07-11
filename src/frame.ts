import { StompFrame, StompEventEmitter, StompError, StompConfig } from "./model";
import { StompStreamLayer } from "./stream";
import { EventEmitter } from "events";


enum StompFrameStatus {
    COMMAND = 0,
    HEADERS = 1,
    BODY = 2,
    ERROR = 3
}

export type StompFrameEvent = 'frame' | 'error' | 'end';

export class StompFrameLayer {

    public readonly emitter = new StompEventEmitter<StompFrameEvent>();
    public maxBufferSize = 10 * 1024;
    private frame: StompFrame;
    private contentLength: number;
    private buffer = Buffer.alloc(0);
    private status = StompFrameStatus.COMMAND;
    private newlineCounter = 0;
    public headerFilter = (headerName: string) => true;

    constructor(private readonly stream: StompStreamLayer) {
        stream.emitter.on('data', (data: Buffer) => this.onData(data));
        stream.emitter.on('end', () => this.onEnd());
    }

    public async send(frame: StompFrame) {
        let data = frame.command + '\n';
        let headers = Object.keys(frame.headers).filter(this.headerFilter).sort();
        for (var key of headers) {
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

        await this.stream.send(data);
    }

    public async close() {
        await this.stream.close();
    }

    private onData(data: Buffer) {
        this.buffer = Buffer.concat([this.buffer, data]);
        if (this.buffer.length <= this.maxBufferSize) {
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
        } else {
            this.error(new StompError('Maximum buffer size exceeded.'));
            this.stream.close();
        }
    }

    private onEnd() {
        this.emitter.emit('end');
    }

    private parseCommand() {
        while (this.hasLine()) {
            var commandLine = this.popLine();
            if (commandLine.length > 0 && commandLine.length < 30) {
                this.frame = new StompFrame(commandLine.toString().replace('\r', ''));
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
            if (headerLine.length === 0) {
                this.incrementStatus();
                break;
            } else {
                var kv = headerLine.toString().replace('\r', '').split(':');
                if (kv.length < 2) {
                    this.error(new StompError('Error parsing header', `No ':' in line '${headerLine}'`));
                    break;
                }
                value = kv.slice(1).join(':');
                this.frame.setHeader(kv[0], value);
                if (kv[0] === 'content-length') {
                    this.contentLength = parseInt(value);
                }
            }
        }
    }

    private parseBody() {
        var bufferBuffer = new Buffer(this.buffer);

        if (this.contentLength > -1) {
            var remainingLength = this.contentLength - this.frame.body.length;

            if (remainingLength < bufferBuffer.length) {
                this.frame.appendToBody(bufferBuffer.slice(0, remainingLength));
                this.buffer = bufferBuffer.slice(remainingLength, bufferBuffer.length);

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
            this.buffer = Buffer.alloc(0);
        } else {
            // The end of the frame has been identified, finish creating it
            this.frame.appendToBody(this.buffer.slice(0, index));

            // Emit the frame and reset
            this.emitter.emit('frame', this.frame); // Event emit to catch any frame emission

            this.incrementStatus();
            this.buffer = this.buffer.slice(index + 1);
        }
    }

    /**
     * Parses the error
     */
    private parseError() {
        var index = this.buffer.indexOf('\0');
        if (index > -1) {
            this.buffer = this.buffer.slice(index + 1);
            this.incrementStatus();
        } else {
            this.buffer = Buffer.alloc(0);
        }
    }

    /**
     * Pops a new line from the stream
     * @return {string} the new line available
     */
    private popLine() {
        if (this.newlineCounter++ > 100) { //security check for newline char flooding
            this.stream.close();
            return Buffer.alloc(0);
        }
        var index = this.buffer.indexOf('\n');
        var line = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + 1);
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
    private error(error: StompError) {
        this.emitter.emit('error', error);
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
