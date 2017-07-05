import { StompFrame, StompHeaders, StompError, StompSessionData } from './model';
import { StompFrameLayer } from './frame';
import {
    StompCommandListener, StompClientCommandListener, StompServerCommandListener,
    StompCommand, StompCommands, StompServerCommands, StompClientCommands,
    StompProtocolHandler, StompProtocolHandlerV10
} from './protocol';
import { StompValidator, StompValidationResult } from './validators';


export interface StompSession<L extends StompCommandListener> {
    //readonly frameLayer: StompFrameLayer;
    readonly listener: L;
    readonly data: StompSessionData;
    close(): Promise<void>;
}

abstract class StompSessionLayer<L extends StompCommandListener> implements StompSession<L> {

    protected abstract get inboundCommands(): StompCommands<L>;
    readonly data = new StompSessionData();

    constructor(public readonly frameLayer: StompFrameLayer, public readonly listener: L) {
        frameLayer.emitter.on('frame', (frame) => this.onFrame(frame));
        frameLayer.emitter.on('error', (error) => this.listener.onProtocolError(error));
        frameLayer.emitter.on('end', () => this.listener.onEnd());
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
            this.handleFrame(command, frame);
        } else {
            this.onError(new StompError('No such command', `Unrecognized Command '${frame.command}'`));
        }
    }

    protected handleFrame(command: StompCommand<L>, frame: StompFrame) {
        command.handle(frame, this);
    }

    protected async sendFrame(frame: StompFrame) {
        return this.frameLayer.send(frame);
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


//TODO server: override handleFrame and check if (!authenticated && frame.command != 'CONNECT'), send 'You must first issue a CONNECT command'


export class StompServerSessionLayer extends StompSessionLayer<StompClientCommandListener> implements StompServerCommands {

    private protocol = StompProtocolHandlerV10;

    protected get inboundCommands() {
        return this.protocol.client;
    }

    constructor(frameLayer: StompFrameLayer, listener: StompClientCommandListener) {
        super(frameLayer, listener);
    }

    protected handleFrame(command: StompCommand<StompClientCommandListener>, frame: StompFrame) {
        if (this.data.authenticated || frame.command === 'CONNECT') {
            super.handleFrame(command, frame);
        } else {
            this.error({ message: 'You must first issue a CONNECT command' });
        }
    }

    protected onError(error: StompError) {
        //TODO!
        console.error('StompServerSessionLayer.onError', error);
    }

    /*protected onEnd() {
        //TODO!
        console.info('StompServerSessionLayer.onEnd');
    }*/


    public async connected(headers?: StompHeaders) {
        this.data.authenticated = true;
        return this.sendFrame(new StompFrame('CONNECTED', headers));
    }

    public async message(headers?: StompHeaders, body?: string) {
        return this.sendFrame(new StompFrame('MESSAGE', headers, body));
    }

    public async receipt(headers?: StompHeaders) {
        return this.sendFrame(new StompFrame('RECEIPT', headers));
    }

    public async error(headers?: StompHeaders, body?: string) {
        await this.sendFrame(new StompFrame('ERROR', headers, body));
        await this.frameLayer.close();
    }

}




export class StompClientSessionLayer extends StompSessionLayer<StompServerCommandListener> implements StompClientCommands {

    private protocol = StompProtocolHandlerV10; //TODO: v.1.2

    protected get inboundCommands() {
        return this.protocol.server;
    }

    constructor(frameLayer: StompFrameLayer, listener: StompServerCommandListener) {
        super(frameLayer, listener);
    }

    protected onError(error: StompError) {
        this.listener.onProtocolError(error);
        //console.error('StompClientSessionLayer.onError', error);
    }

    public async connect(headers?: StompHeaders): Promise<void> {
        this.sendFrame(new StompFrame('CONNECT', headers));
    }

    public async send(headers?: StompHeaders, body?: string): Promise<void> {
        this.sendFrame(new StompFrame('SEND', headers, body));
    }

    public async subscribe(headers?: StompHeaders): Promise<void> {
        this.sendFrame(new StompFrame('SUBSCRIBE', headers));
    }

    public async unsubscribe(headers?: StompHeaders): Promise<void> {
        this.sendFrame(new StompFrame('UNSUBSCRIBE', headers));
    }

    public async begin(headers?: StompHeaders): Promise<void> {
        this.sendFrame(new StompFrame('BEGIN', headers));
    }

    public async commit(headers?: StompHeaders): Promise<void> {
        this.sendFrame(new StompFrame('COMMIT', headers));
    }

    public async abort(headers?: StompHeaders): Promise<void> {
        this.sendFrame(new StompFrame('ABORT', headers));
    }

    public async ack(headers?: StompHeaders): Promise<void> {
        this.sendFrame(new StompFrame('ACK', headers));
    }

    public async nack(headers?: StompHeaders): Promise<void> {
        this.sendFrame(new StompFrame('NACK', headers));
    }

    public async disconnect(headers?: StompHeaders): Promise<void> {
        this.sendFrame(new StompFrame('DISCONNECT', headers));
    }
}
