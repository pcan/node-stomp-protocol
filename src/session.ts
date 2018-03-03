import { StompFrame, StompHeaders, StompError, StompSessionData } from './model';
import { StompFrameLayer } from './frame';
import {
    StompCommandListener, StompClientCommandListener, StompServerCommandListener,
    StompCommand, StompCommands, StompServerCommands, StompClientCommands,
    StompProtocolHandler, StompProtocolHandlerV10, StompProtocolHandlerV11, StompProtocolHandlerV12
} from './protocol';
import { StompValidator, StompValidationResult } from './validators';


export interface StompSession<L extends StompCommandListener> {
    readonly listener: L;
    readonly data: StompSessionData;
    close(): Promise<void>;
}

export abstract class StompSessionLayer<L extends StompCommandListener> implements StompSession<L> {

    protected abstract get inboundCommands(): StompCommands<L>;
    readonly data = new StompSessionData();
    public internalErrorHandler = console.error;

    constructor(public readonly frameLayer: StompFrameLayer, public readonly listener: L) {
        frameLayer.emitter.on('frame', (frame) => this.onFrame(frame));
        frameLayer.emitter.on('error', (error) => this.listener.onProtocolError(error));
        frameLayer.emitter.on('end', () => this.onEnd());
    }

    private onFrame(frame: StompFrame) {
        if (this.isValidCommand(frame.command)) {
            const command = this.inboundCommands[frame.command];
            const validators = command.validators;
            let validation: StompValidationResult;
            for (let validator of validators) {
                validation = validator(frame, this.data);
                if (!validation.isValid) {
                    this.onError(new StompError(validation.message, validation.details));
                    return;
                }
            }
            this.handleFrame(command, frame).catch(this.internalErrorHandler);
        } else {
            this.onError(new StompError('No such command', `Unrecognized Command '${frame.command}'`));
        }
    }

    protected async handleFrame(command: StompCommand<L>, frame: StompFrame) {
        await command.handle(frame, this);
    }

    protected async sendFrame(frame: StompFrame) {
        await this.frameLayer.send(frame);
    }

    private onEnd() {
        delete this.data.subscriptions;
        this.listener.onEnd();
    }

    async close() {
        return this.frameLayer.close();
    }

    protected abstract onError(error: StompError): void;

    private isValidCommand(command: string) {
        return (command && command.length < 20 && this.inboundCommands[command]);
    }

}

interface MessageHeaders extends StompHeaders {
    destination: string;
    'message-id': string;
    subscription: string;
}


export class StompServerSessionLayer extends StompSessionLayer<StompClientCommandListener> implements StompServerCommands {

    private protocol = StompProtocolHandlerV10;

    protected get inboundCommands() {
        return this.protocol.client;
    }

    constructor(frameLayer: StompFrameLayer, listener: StompClientCommandListener) {
        super(frameLayer, listener);
    }

    protected async handleFrame(command: StompCommand<StompClientCommandListener>, frame: StompFrame) {
        const receipt = frame.command !== 'CONNECT' && frame.headers && frame.headers.receipt;
        const acceptVersion = frame.command === 'CONNECT' && frame.headers && frame.headers['accept-version'];
        if (this.data.authenticated || frame.command === 'CONNECT') {
            try {
                if (acceptVersion) {
                    this.switchProtocol(acceptVersion);
                }
                await super.handleFrame(command, frame);
                if (receipt) {
                    await this.receipt({ 'receipt-id': receipt });
                }
            } catch (error) {
                const headers: StompHeaders = { message: error.message };
                if (receipt) {
                    headers['receipt-id'] = receipt;
                }
                await this.error(headers, error.details);
            }
        } else {
            await this.error({ message: 'You must first issue a CONNECT command' });
        }
    }

    private switchProtocol(acceptVersion: string) {
        if (acceptVersion.indexOf('1.2') >= 0) {
            this.protocol = StompProtocolHandlerV12;
        } else if (acceptVersion.indexOf('1.1') >= 0) {
            this.protocol = StompProtocolHandlerV11;
        } else if (acceptVersion.indexOf('1.0') < 0) {
            throw new Error('Supported protocol versions are: 1.0, 1.1, 1.2')
        }
    }

    protected onError(error: StompError) {
        this.error({ message: error.message }, error.details).catch(this.internalErrorHandler);
    }

    public async connected(headers?: StompHeaders) {
        this.data.authenticated = true;
        Object.assign(headers || {}, { version: this.protocol.version });
        await this.sendFrame(new StompFrame('CONNECTED', headers));
    }

    public async message(headers?: StompHeaders, body?: string) {
        await this.sendFrame(new StompFrame('MESSAGE', headers, body));
    }

    public async receipt(headers?: StompHeaders) {
        await this.sendFrame(new StompFrame('RECEIPT', headers));
    }

    public async error(headers?: StompHeaders, body?: string) {
        await this.sendFrame(new StompFrame('ERROR', headers, body));
        await this.frameLayer.close();
    }

}

export class StompClientSessionLayer extends StompSessionLayer<StompServerCommandListener> implements StompClientCommands {

    private protocol = StompProtocolHandlerV10;

    protected get inboundCommands() {
        return this.protocol.server;
    }

    constructor(frameLayer: StompFrameLayer, listener: StompServerCommandListener) {
        super(frameLayer, listener);
    }

    protected onError(error: StompError) {
        this.listener.onProtocolError(error);
    }

    protected async handleFrame(command: StompCommand<StompServerCommandListener>, frame: StompFrame) {
        if(frame.command === 'CONNECTED') {
            if(frame.headers.version === '1.1') {
                this.protocol = StompProtocolHandlerV11;
            }
            if(frame.headers.version === '1.2') {
                this.protocol = StompProtocolHandlerV12;
            }
        }
        return super.handleFrame(command, frame);
    }

    public async connect(headers?: StompHeaders): Promise<void> {
        Object.assign(headers || {}, { 'accept-version': '1.0,1.1,1.2' });
        await this.sendFrame(new StompFrame('CONNECT', headers));
    }

    public async send(headers?: StompHeaders, body?: string): Promise<void> {
        await this.sendFrame(new StompFrame('SEND', headers, body));
    }

    public async subscribe(headers?: StompHeaders): Promise<void> {
        await this.sendFrame(new StompFrame('SUBSCRIBE', headers));
    }

    public async unsubscribe(headers?: StompHeaders): Promise<void> {
        await this.sendFrame(new StompFrame('UNSUBSCRIBE', headers));
    }

    public async begin(headers?: StompHeaders): Promise<void> {
        await this.sendFrame(new StompFrame('BEGIN', headers));
    }

    public async commit(headers?: StompHeaders): Promise<void> {
        await this.sendFrame(new StompFrame('COMMIT', headers));
    }

    public async abort(headers?: StompHeaders): Promise<void> {
        await this.sendFrame(new StompFrame('ABORT', headers));
    }

    public async ack(headers?: StompHeaders): Promise<void> {
        await this.sendFrame(new StompFrame('ACK', headers));
    }

    public async nack(headers?: StompHeaders): Promise<void> {
        await this.sendFrame(new StompFrame('NACK', headers));
    }

    public async disconnect(headers?: StompHeaders): Promise<void> {
        await this.sendFrame(new StompFrame('DISCONNECT', headers));
    }
}
