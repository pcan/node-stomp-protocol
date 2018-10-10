import { StompFrame, StompHeaders, StompError, StompSessionData, SendError } from './model';
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
        try {
            await this.frameLayer.send(frame);
        } catch (e) {
            this.sendErrorHandler(new SendError(e, frame));
        }
    }

    private onEnd() {
        log.debug("StompFrameLayer: end event");
        this.listener.onEnd();
    }

    async close() {
        log.debug("StompFrameLayer: closing");
        try {
            return this.frameLayer.close();
        } catch (e) {
            log.debug("StompFrameLayer: error while closing %O", e);
        }
    }

    protected abstract onError(error: StompError): void;

    private isValidCommand(command: string) {
        return (command && command.length < 20 && this.inboundCommands[command]);
    }

    public sendErrorHandler(e: SendError) {
        log.warn("StompSessionLayer: error while sending frame %O", e);
    }

}

export class StompServerSessionLayer extends StompSessionLayer<StompClientCommandListener> {

    private protocol = StompProtocolHandlerV10;

    get protocolVersion() { return this.protocol.version; };

    protected get inboundCommands() {
        return this.protocol.client;
    }

    constructor(frameLayer: StompFrameLayer, listener: StompCommandListenerConstructor<StompServerSessionLayer, StompClientCommandListener> | StompClientCommandListener) {
        super(frameLayer, listener);
    }

    protected handleFrame(command: StompCommand<StompClientCommandListener>, frame: StompFrame) {
        const acceptVersion = frame.command === 'CONNECT' && frame.headers && frame.headers['accept-version'];
        if (this.data.authenticated || frame.command === 'CONNECT') {
            try {
                if (acceptVersion) {
                    log.silly("StompServerSessionLayer: session %s switching protocol %s", this.data.id, acceptVersion);
                    this.switchProtocol(acceptVersion);
                }
                super.handleFrame(command, frame);
            } catch (error) {
                this.onError(new StompError(error.message, error.details));
            }
        } else {
            this.onError(new StompError('You must first issue a CONNECT command'));
        }
    }

    private switchProtocol(acceptVersion: string) {
        if (acceptVersion.indexOf(StompProtocolHandlerV12.version) >= 0) {
            this.protocol = StompProtocolHandlerV12;
        } else if (acceptVersion.indexOf(StompProtocolHandlerV11.version) >= 0) {
            this.protocol = StompProtocolHandlerV11;
        } else if (acceptVersion.indexOf(StompProtocolHandlerV10.version) < 0) {
            throw new Error('Supported protocol versions are: 1.0, 1.1, 1.2')
        }
    }

    protected onError(error: StompError) {
        this.error({ message: error.message }, error.details);
    }

    public async connected(headers: StompHeaders) {
        log.debug("StompServerSessionLayer: sending CONNECTED frame %j", headers);
        this.data.authenticated = true;
        Object.assign(headers || {}, { version: this.protocol.version });
        await this.sendFrame(new StompFrame('CONNECTED', headers));
    }

    public async message(headers: StompHeaders, body?: string) {
        log.silly("StompServerSessionLayer: sending MESSAGE frame %j %s", headers, body);
        await this.sendFrame(new StompFrame('MESSAGE', headers, body));
    }

    public async receipt(headers: StompHeaders) {
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
            if (frame.headers.version === StompProtocolHandlerV11.version) {
                this.protocol = StompProtocolHandlerV11;
            }
            if (frame.headers.version === StompProtocolHandlerV12.version) {
                this.protocol = StompProtocolHandlerV12;
            }
        }
        try {
            super.handleFrame(command, frame);
        } catch (error) {
            log.debug("StompClientSessionLayer: error while handling frame %O", frame);
            this.onError(new StompError(error.message));
        }
    }

    public async connect(headers: StompHeaders): Promise<void> {
        log.debug("StompClientSessionLayer: sending CONNECT frame %j", headers);
        headers = Object.assign({ 'accept-version': '1.0,1.1,1.2' }, headers);
        await this.sendFrame(new StompFrame('CONNECT', headers));
    }

    public async send(headers: StompHeaders, body?: string): Promise<void> {
        log.silly("StompClientSessionLayer: sending SEND frame %j %s", headers, body);
        await this.sendFrame(new StompFrame('SEND', headers, body));
    }

    public async subscribe(headers: StompHeaders): Promise<void> {
        log.debug("StompClientSessionLayer: sending SUBSCRIBE frame %j", headers);
        await this.sendFrame(new StompFrame('SUBSCRIBE', headers));
    }

    public async unsubscribe(headers: StompHeaders): Promise<void> {
        log.debug("StompClientSessionLayer: sending UNSUBSCRIBE frame %j", headers);
        await this.sendFrame(new StompFrame('UNSUBSCRIBE', headers));
    }

    public async begin(headers: StompHeaders): Promise<void> {
        log.silly("StompClientSessionLayer: sending BEGIN frame %j", headers);
        await this.sendFrame(new StompFrame('BEGIN', headers));
    }

    public async commit(headers: StompHeaders): Promise<void> {
        log.silly("StompClientSessionLayer: sending COMMIT frame %j", headers);
        await this.sendFrame(new StompFrame('COMMIT', headers));
    }

    public async abort(headers: StompHeaders): Promise<void> {
        log.silly("StompClientSessionLayer: sending ABORT frame %j", headers);
        await this.sendFrame(new StompFrame('ABORT', headers));
    }

    public async ack(headers: StompHeaders): Promise<void> {
        log.silly("StompClientSessionLayer: sending ACK frame %j", headers);
        await this.sendFrame(new StompFrame('ACK', headers));
    }

    public async nack(headers: StompHeaders): Promise<void> {
        log.silly("StompClientSessionLayer: sending NACK frame %j", headers);
        await this.sendFrame(new StompFrame('NACK', headers));
    }

    public async disconnect(headers?: StompHeaders): Promise<void> {
        log.debug("StompClientSessionLayer: sending DISCONNECT frame %j", headers);
        await this.sendFrame(new StompFrame('DISCONNECT', headers));
    }
}
