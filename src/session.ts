import { StompFrame, StompHeaders, StompError, StompSessionData } from './model';
import { StompFrameLayer } from './frame';
import {
    StompCommandListener, StompClientCommandListener, StompServerCommandListener,
    StompCommand, StompCommands, StompProtocolHandlerV10, StompProtocolHandlerV11,
    StompProtocolHandlerV12
} from './protocol';
import { StompValidationResult } from './validators';
import { log } from './utils';

export interface StompSession<L extends StompCommandListener> {
    readonly listener: L;
    readonly data: StompSessionData;
    close(): Promise<void>;
}

export interface StompCommandListenerConstructor<S extends StompSessionLayer<L>, L extends StompCommandListener,> {
    new(session: S): L;
}

export interface StompClientCommandListenerConstructor extends StompCommandListenerConstructor<StompServerSessionLayer, StompClientCommandListener> { }
export interface StompServerCommandListenerConstructor extends StompCommandListenerConstructor<StompClientSessionLayer, StompServerCommandListener> { }

export abstract class StompSessionLayer<L extends StompCommandListener> implements StompSession<L> {

    protected abstract get inboundCommands(): StompCommands<L>;
    readonly data = new StompSessionData();
    public internalErrorHandler = (e: Error) => log.warn("StompSessionLayer: internal error %O", e);
    public readonly listener: L;

    constructor(public readonly frameLayer: StompFrameLayer, listener: L | (new (session: any) => L)) {
        log.debug("StompSessionLayer: initializing");
        if (typeof listener === 'function') {
            this.listener = new listener(this);
        } else {
            this.listener = listener;
        }
        frameLayer.emitter.on('frame', (frame) => this.onFrame(frame));
        frameLayer.emitter.on('error', (error) => this.listener.onProtocolError(error));
        frameLayer.emitter.on('end', () => this.onEnd());
    }

    private onFrame(frame: StompFrame) {
        log.silly("StompSessionLayer: received command %s", frame.command);
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
        log.silly("StompSessionLayer: handling frame %j", frame);
        command.handle(frame, this);
    }

    protected async sendFrame(frame: StompFrame) {
        await this.frameLayer.send(frame);
    }

    private onEnd() {
        log.debug("StompFrameLayer: end event");
        delete this.data.subscriptions;
        this.listener.onEnd();
    }

    async close() {
        log.debug("StompFrameLayer: closing");
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

export class StompServerSessionLayer extends StompSessionLayer<StompClientCommandListener> {

    private protocol = StompProtocolHandlerV10;

    protected get inboundCommands() {
        return this.protocol.client;
    }

    constructor(frameLayer: StompFrameLayer, listener: StompCommandListenerConstructor<StompServerSessionLayer, StompClientCommandListener> | StompClientCommandListener) {
        super(frameLayer, listener);
        const a = this as StompSessionLayer<StompClientCommandListener>;
    }

    protected handleFrame(command: StompCommand<StompClientCommandListener>, frame: StompFrame) {
        const receipt = frame.command !== 'CONNECT' && frame.headers && frame.headers.receipt;
        const acceptVersion = frame.command === 'CONNECT' && frame.headers && frame.headers['accept-version'];
        if (this.data.authenticated || frame.command === 'CONNECT') {
            try {
                if (acceptVersion) {
                    log.silly("StompServerSessionLayer: session %s switching protocol %s", this.data.id, acceptVersion);
                    this.switchProtocol(acceptVersion);
                }
                super.handleFrame(command, frame);
            } catch (error) {
                const headers: StompHeaders = { message: error.message };
                if (receipt) {
                    headers['receipt-id'] = receipt;
                }
                this.error(headers, error.details).catch(this.internalErrorHandler);
            }
        } else {
            this.error({ message: 'You must first issue a CONNECT command' }).catch(this.internalErrorHandler);
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
        log.debug("StompServerSessionLayer: sending CONNECTED frame %j", headers);
        this.data.authenticated = true;
        Object.assign(headers || {}, { version: this.protocol.version });
        await this.sendFrame(new StompFrame('CONNECTED', headers));
    }

    public async message(headers?: StompHeaders, body?: string) {
        log.silly("StompServerSessionLayer: sending MESSAGE frame %j %s", headers, body);
        await this.sendFrame(new StompFrame('MESSAGE', headers, body));
    }

    public async receipt(headers?: StompHeaders) {
        log.silly("StompServerSessionLayer: sending RECEIPT frame %j", headers);
        await this.sendFrame(new StompFrame('RECEIPT', headers));
    }

    public async error(headers?: StompHeaders, body?: string) {
        log.debug("StompServerSessionLayer: sending ERROR frame %j %s", headers, body);
        await this.sendFrame(new StompFrame('ERROR', headers, body));
        await this.frameLayer.close();
    }

}

export class StompClientSessionLayer extends StompSessionLayer<StompServerCommandListener> {

    private protocol = StompProtocolHandlerV10;

    protected get inboundCommands() {
        return this.protocol.server;
    }

    constructor(frameLayer: StompFrameLayer, listener: StompCommandListenerConstructor<StompClientSessionLayer, StompServerCommandListener> | StompServerCommandListener) {
        super(frameLayer, listener);
    }

    protected onError(error: StompError) {
        this.listener.onProtocolError(error);
    }

    protected handleFrame(command: StompCommand<StompServerCommandListener>, frame: StompFrame) {
        if (frame.command === 'CONNECTED') {
            log.debug("StompClientSessionLayer: received CONNECTED frame %j", frame.headers);
            if (frame.headers.version === '1.1') {
                this.protocol = StompProtocolHandlerV11;
            }
            if (frame.headers.version === '1.2') {
                this.protocol = StompProtocolHandlerV12;
            }
        }
        try {
            super.handleFrame(command, frame);
        } catch (error) {
            this.internalErrorHandler(error);
        }
    }

    public async connect(headers?: StompHeaders): Promise<void> {
        log.debug("StompClientSessionLayer: sending CONNECT frame %j", headers);
        Object.assign(headers || {}, { 'accept-version': '1.0,1.1,1.2' });
        await this.sendFrame(new StompFrame('CONNECT', headers));
    }

    public async send(headers?: StompHeaders, body?: string): Promise<void> {
        log.silly("StompClientSessionLayer: sending SEND frame %j %s", headers, body);
        await this.sendFrame(new StompFrame('SEND', headers, body));
    }

    public async subscribe(headers?: StompHeaders): Promise<void> {
        log.debug("StompClientSessionLayer: sending SUBSCRIBE frame %j", headers);
        await this.sendFrame(new StompFrame('SUBSCRIBE', headers));
    }

    public async unsubscribe(headers?: StompHeaders): Promise<void> {
        log.debug("StompClientSessionLayer: sending UNSUBSCRIBE frame %j", headers);
        await this.sendFrame(new StompFrame('UNSUBSCRIBE', headers));
    }

    public async begin(headers?: StompHeaders): Promise<void> {
        log.silly("StompClientSessionLayer: sending BEGIN frame %j", headers);
        await this.sendFrame(new StompFrame('BEGIN', headers));
    }

    public async commit(headers?: StompHeaders): Promise<void> {
        log.silly("StompClientSessionLayer: sending COMMIT frame %j", headers);
        await this.sendFrame(new StompFrame('COMMIT', headers));
    }

    public async abort(headers?: StompHeaders): Promise<void> {
        log.silly("StompClientSessionLayer: sending ABORT frame %j", headers);
        await this.sendFrame(new StompFrame('ABORT', headers));
    }

    public async ack(headers?: StompHeaders): Promise<void> {
        log.silly("StompClientSessionLayer: sending ACK frame %j", headers);
        await this.sendFrame(new StompFrame('ACK', headers));
    }

    public async nack(headers?: StompHeaders): Promise<void> {
        log.silly("StompClientSessionLayer: sending NACK frame %j", headers);
        await this.sendFrame(new StompFrame('NACK', headers));
    }

    public async disconnect(headers?: StompHeaders): Promise<void> {
        log.debug("StompClientSessionLayer: sending DISCONNECT frame %j", headers);
        await this.sendFrame(new StompFrame('DISCONNECT', headers));
    }
}
